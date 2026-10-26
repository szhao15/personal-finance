import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga'
import { openDb } from './db.ts'
import { resolvers, type Ctx } from './resolvers.ts'
import { typeDefs } from './schema.ts'
import { seed } from './seed.ts'

const path = process.env.DB_PATH ?? new URL('../data/finance.db', import.meta.url).pathname
const db = openDb(path)
// First run: fill the database with mock data.
if ((db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n === 0) seed(db)

export const yoga = createYoga<object, Ctx>({
  schema: createSchema<Ctx>({ typeDefs, resolvers: resolvers as never }),
  context: () => ({ db, cache: new Map() }),
  graphqlEndpoint: '/graphql',
  cors: { origin: ['http://localhost:5180'], credentials: false },
})

const port = Number(process.env.PORT ?? 4000)
createServer(yoga).listen(port, '127.0.0.1', () => console.log(`API ready at http://localhost:${port}/graphql`))
