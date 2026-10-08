# Makefile for SoftArchitect AI
.PHONY: test build up down seed

test:
	@docker compose -p softarchitect-test -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from backend

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down -v

seed:
	docker compose exec backend python -m app.seed.seed_db
