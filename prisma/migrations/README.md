# Migrations

## Initial migration

Run against a live database:

```bash
# Development (creates migration file + applies it)
npx prisma migrate dev --name init

# Production (apply without prompts)
npx prisma migrate deploy
```

## Schema-only push (no migration file, good for rapid local dev)

```bash
npx prisma db push
```

## Reset dev database (drops + re-creates all tables)

```bash
npx prisma migrate reset
```
