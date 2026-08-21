import { createYoga } from 'graphql-yoga';
import { graphqlSchema } from '@/lib/graphql/schema';
import { requireSession } from '@/lib/auth';

const yoga = createYoga({
  schema: graphqlSchema,
  context: async ({ request }) => {
    const auth = await requireSession();
    return { auth };
  },
  graphiql: process.env.NODE_ENV !== 'production',
  maskedErrors: process.env.NODE_ENV === 'production',
});

export async function GET(request: Request) {
  return yoga.fetch(request);
}

export async function POST(request: Request) {
  return yoga.fetch(request);
}

export async function OPTIONS(request: Request) {
  return yoga.fetch(request);
}