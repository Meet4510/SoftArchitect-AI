#!/usr/bin/env bash
# run-tests.sh - Helper for WSL/Linux/macOS to run CI-style tests using docker compose override
set -euo pipefail

COMPOSE_FILE=docker-compose.test.yml
PROJECT_NAME=softarchitect-test

echo "Running SoftArchitect AI test runner..."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Please install Docker and ensure 'docker' is on PATH." >&2
  exit 1
fi

ARGS=("-p" "$PROJECT_NAME" "-f" "$COMPOSE_FILE" "up" "--build" "--abort-on-container-exit" "--exit-code-from" "backend")

docker compose "${ARGS[@]}" || {
  echo "Test run failed. Showing backend logs..." >&2
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs backend || true
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down --volumes || true
  exit 1
}

echo "All tests passed. Cleaning up..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down --volumes
