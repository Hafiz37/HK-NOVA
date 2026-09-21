// HK-NOVA Push Notifications
// Service Worker registration and push subscription management

class PushNotifications {
    constructor() {
        this.swRegistration = null;
        this.isSubscribed = false;
        
        this.init();
    }
    
    async init() {
        // Check if service workers are supported
        if (!('serviceWorker' in navigator)) {
            console.warn('Service workers not supported');
            return;
        }
        
        // Check if push is supported
        if (!('PushManager' in window)) {
            console.warn('Push notifications not supported');
            return;
        }
        
        try {
            // Register service worker
            this.swRegistration = await navigator.serviceWorker.register('/static/sw.js');
            console.log('Service Worker registered:', this.swRegistration);
            
            // Check current subscription status
            await this.checkSubscription();
            
            // Ask for permission if not granted
            if (Notification.permission === 'default') {
                // Show subtle prompt to user
                this.showNotificationPrompt();
            }
            
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
    
    async checkSubscription() {
        try {
            const subscription = await this.swRegistration.pushManager.getSubscription();
            this.isSubscribed = subscription !== null;
            
            if (this.isSubscribed) {
                console.log('User is already subscribed to push notifications');
            }
            
            return this.isSubscribed;
        } catch (error) {
            console.error('Error checking subscription:', error);
            return false;
        }
    }
    
    showNotificationPrompt() {
        // Create a small banner to ask for notification permission
        const banner = document.createElement('div');
        banner.className = 'notification-prompt';
        banner.innerHTML = `
            <div class="alert alert-info d-flex justify-content-between align-items-center mb-0" role="alert">
                <span>
                    <i class="bi bi-bell me-2"></i>
                    <strong>Enable notifications</strong> to receive backup alerts and status updates
                </span>
                <div>
                    <button class="btn btn-sm btn-primary me-2" id="enable-notifications">
                        Enable
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" id="dismiss-notifications">
                        Not now
                    </button>
                </div>
            </div>
        `;
        
        document.body.insertBefore(banner, document.body.firstChild);
        
        document.getElementById('enable-notifications').addEventListener('click', () => {
            this.requestPermission();
            banner.remove();
        });
        
        document.getElementById('dismiss-notifications').addEventListener('click', () => {
            banner.remove();
            // Remember dismissal
            localStorage.setItem('notificationPromptDismissed', Date.now());
        });
    }
    
    async requestPermission() {
        try {
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
                console.log('Notification permission granted');
                await this.subscribe();
                this.showToast('Notifications enabled successfully!', 'success');
            } else if (permission === 'denied') {
                console.warn('Notification permission denied');
                this.showToast('Notifications blocked. Enable in browser settings.', 'error');
            }
            
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
    }
    
    async subscribe() {
        try {
            // Get public VAPID key from server (you'll need to implement this endpoint)
            const response = await fetch('/api/v1/notifications/vapid-public-key');
            const { publicKey } = await response.json();
            
            // Convert base64 to Uint8Array
            const convertedVapidKey = this.urlBase64ToUint8Array(publicKey);
            
            // Subscribe to push notifications
            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });
            
            console.log('User subscribed to push notifications:', subscription);
            
            // Send subscription to server
            await this.sendSubscriptionToServer(subscription);
            
            this.isSubscribed = true;
            
        } catch (error) {
            console.error('Failed to subscribe to push notifications:', error);
            this.showToast('Failed to enable notifications', 'error');
        }
    }
    
    async sendSubscriptionToServer(subscription) {
        try {
            const response = await fetch('/api/v1/notifications/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription)
            });
            
            if (!response.ok) {
                throw new Error('Failed to send subscription to server');
            }
            
            console.log('Subscription sent to server');
            
        } catch (error) {
            console.error('Error sending subscription to server:', error);
            throw error;
        }
    }
    
    async unsubscribe() {
        try {
            const subscription = await this.swRegistration.pushManager.getSubscription();
            
            if (subscription) {
                await subscription.unsubscribe();
                console.log('User unsubscribed from push notifications');
                
                // Notify server
                await fetch('/api/v1/notifications/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
                
                this.isSubscribed = false;
                this.showToast('Notifications disabled', 'success');
            }
            
        } catch (error) {
            console.error('Error unsubscribing from push notifications:', error);
        }
    }
    
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        
        return outputArray;
    }
    
    showToast(message, type) {
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if not dismissed recently (within 7 days)
    const dismissed = localStorage.getItem('notificationPromptDismissed');
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    if (!dismissed || parseInt(dismissed) < sevenDaysAgo) {
        window.pushNotifications = new PushNotifications();
    }
});

// Export for manual control
window.PushNotifications = PushNotifications;
