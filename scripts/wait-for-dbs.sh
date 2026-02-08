#!/usr/bin/env bash
set -euo pipefail

# Wait for MySQL, Postgres and DynamoDB to be available
echo "Waiting for MySQL on localhost:3306..."
until nc -z localhost 3306; do sleep 1; done

echo "Waiting for Postgres on localhost:5432..."
until nc -z localhost 5432; do sleep 1; done

echo "Waiting for DynamoDB on localhost:8000..."
until curl -sS http://localhost:8000/ >/dev/null 2>&1; do sleep 1; done

echo "All services are available."
