import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';

export interface PolicyEvaluationResult {
  allowed: boolean;
  matchedPolicies: string[];
}

export async function evaluateAttributePolicies(
  userId: string,
  resourceType: string,
  resource: any,
  action: string
): Promise<PolicyEvaluationResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return { allowed: false, matchedPolicies: [] };

  const policies = await prisma.attributePolicy.findMany({
    where: {
      role: user.role,
      resourceType,
      enabled: true,
    },
    orderBy: { priority: 'desc' },
  });

  const matchedPolicies: string[] = [];

  for (const policy of policies) {
    if (matchesConditions(resource, policy.conditions as Record<string, any>)) {
      const permissions = policy.permissions as string[];
      const permissionKey = `${resourceType}:${action}`;
      if (permissions.includes(permissionKey) || permissions.includes('*')) {
        matchedPolicies.push(policy.name);
      }
    }
  }

  return { allowed: matchedPolicies.length > 0, matchedPolicies };
}

function matchesConditions(resource: any, conditions: Record<string, any>): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;

  for (const [key, expected] of Object.entries(conditions)) {
    const actual = resource[key];

    if (typeof expected === 'object' && expected !== null) {
      if (!matchOperator(actual, expected)) return false;
    } else {
      if (actual !== expected) return false;
    }
  }
  return true;
}

function matchOperator(actual: any, expected: Record<string, any>): boolean {
  if (expected.$eq !== undefined) return actual === expected.$eq;
  if (expected.$ne !== undefined) return actual !== expected.$ne;
  if (expected.$in !== undefined) return Array.isArray(expected.$in) && expected.$in.includes(actual);
  if (expected.$nin !== undefined) return Array.isArray(expected.$nin) && !expected.$nin.includes(actual);
  if (expected.$gt !== undefined) return typeof actual === 'number' && actual > expected.$gt;
  if (expected.$gte !== undefined) return typeof actual === 'number' && actual >= expected.$gte;
  if (expected.$lt !== undefined) return typeof actual === 'number' && actual < expected.$lt;
  if (expected.$lte !== undefined) return typeof actual === 'number' && actual <= expected.$lte;
  if (expected.$and !== undefined) return Array.isArray(expected.$and) && expected.$and.every((c) => matchOperator(actual, c));
  if (expected.$or !== undefined) return Array.isArray(expected.$or) && expected.$or.some((c) => matchOperator(actual, c));
  if (expected.$regex !== undefined) {
    const flags = expected.$options || '';
    const regex = new RegExp(expected.$regex, flags);
    return regex.test(String(actual));
  }
  return false;
}