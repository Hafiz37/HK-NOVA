import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const sshConnectionErrors = new Counter('ssh_connection_errors');
const sshConnectionDuration = new Trend('ssh_connection_duration');
const deviceDiscoverySuccess = new Rate('device_discovery_success');
const configUpdateSuccess = new Rate('config_update_success');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 VUs
    { duration: '5m', target: 100 },  // Ramp up to 100 VUs
    { duration: '10m', target: 100 }, // Stay at 100 VUs
    { duration: '3m', target: 200 },  // Spike to 200 VUs
    { duration: '2m', target: 100 },  // Scale back
    { duration: '5m', target: 100 },  // Sustained load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    ssh_connection_errors: ['count<100'],
    device_discovery_success: ['rate>0.90'],
    config_update_success: ['rate>0.85'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const USERNAME = __ENV.TEST_USERNAME || 'operator';
const PASSWORD = __ENV.TEST_PASSWORD || 'test-password';

let authToken = null;

export function setup() {
  // Authenticate once for all VUs
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    username: USERNAME,
    password: PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const token = loginRes.json('token');
  console.log('Setup completed - Authentication token obtained');
  
  return { token };
}

export default function (data) {
  authToken = data.token;
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };
  
  // Scenario selection based on VU number
  const scenario = __VU % 3;
  
  switch (scenario) {
    case 0:
      deviceDiscoveryScenario(headers);
      break;
    case 1:
      deviceMonitoringScenario(headers);
      break;
    case 2:
      configUpdateScenario(headers);
      break;
  }
  
  sleep(1);
}

function deviceDiscoveryScenario(headers) {
  // Start device discovery
  const subnet = `10.${Math.floor(Math.random() * 255)}.0.0/24`;
  
  const startRes = http.post(
    `${BASE_URL}/api/discovery/start`,
    JSON.stringify({
      subnet: subnet,
      protocol: 'SSH',
      concurrent: 10,
    }),
    { headers }
  );
  
  const success = check(startRes, {
    'discovery started': (r) => r.status === 200,
    'job ID returned': (r) => r.json('jobId') !== undefined,
  });
  
  deviceDiscoverySuccess.add(success);
  
  if (!success) {
    sshConnectionErrors.add(1);
    return;
  }
  
  const jobId = startRes.json('jobId');
  
  // Poll discovery status
  let completed = false;
  let attempts = 0;
  const maxAttempts = 30;
  
  while (!completed && attempts < maxAttempts) {
    sleep(2);
    
    const statusRes = http.get(
      `${BASE_URL}/api/discovery/status/${jobId}`,
      { headers }
    );
    
    if (statusRes.status === 200) {
      const status = statusRes.json('status');
      completed = status === 'COMPLETED' || status === 'FAILED';
      
      if (status === 'FAILED') {
        sshConnectionErrors.add(1);
      }
    }
    
    attempts++;
  }
}

function deviceMonitoringScenario(headers) {
  // Get device list
  const devicesRes = http.get(`${BASE_URL}/api/devices`, { headers });
  
  if (devicesRes.status !== 200) {
    return;
  }
  
  const devices = devicesRes.json('devices');
  if (!devices || devices.length === 0) {
    return;
  }
  
  // Pick random device
  const device = devices[Math.floor(Math.random() * devices.length)];
  
  // Get device details
  http.get(`${BASE_URL}/api/devices/${device.id}`, { headers });
  
  sleep(1);
  
  // Get device metrics
  http.get(`${BASE_URL}/api/monitoring/metrics/${device.id}`, { headers });
  
  sleep(2);
  
  // Get device status
  http.get(`${BASE_URL}/api/devices/${device.id}/status`, { headers });
}

function configUpdateScenario(headers) {
  // Get device list
  const devicesRes = http.get(`${BASE_URL}/api/devices?limit=10`, { headers });
  
  if (devicesRes.status !== 200) {
    return;
  }
  
  const devices = devicesRes.json('devices');
  if (!devices || devices.length === 0) {
    return;
  }
  
  // Select random devices for bulk update
  const selectedDevices = devices
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(5, devices.length))
    .map(d => d.id);
  
  // Start bulk configuration
  const configRes = http.post(
    `${BASE_URL}/api/config/bulk-update`,
    JSON.stringify({
      deviceIds: selectedDevices,
      commands: [
        `/system identity set name=test-${Date.now()}`,
      ],
    }),
    { headers }
  );
  
  const success = check(configRes, {
    'config update started': (r) => r.status === 200,
    'task ID returned': (r) => r.json('taskId') !== undefined,
  });
  
  configUpdateSuccess.add(success);
  
  if (!success) {
    return;
  }
  
  const taskId = configRes.json('taskId');
  
  // Poll task status
  let completed = false;
  let attempts = 0;
  const maxAttempts = 20;
  
  while (!completed && attempts < maxAttempts) {
    sleep(3);
    
    const statusRes = http.get(
      `${BASE_URL}/api/config/task-status/${taskId}`,
      { headers }
    );
    
    if (statusRes.status === 200) {
      const status = statusRes.json('status');
      completed = status === 'COMPLETED' || status === 'FAILED';
    }
    
    attempts++;
  }
}

export function teardown(data) {
  console.log('Test completed - cleaning up');
}
