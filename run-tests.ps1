# run-tests.ps1 - Helper to run CI-style tests in Docker
# Usage: Run this in PowerShell from the repository root

Write-Host "Running SoftArchitect AI test runner..."

# Check Docker availability
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not available or not on PATH. Please install Docker Desktop and ensure 'docker' command is accessible."
    exit 1
}

$composeArgs = @(
    "-p", "softarchitect-test",
    "-f", "docker-compose.test.yml",
    "up", "--build", "--abort-on-container-exit", "--exit-code-from", "backend"
)
Write-Host "Executing: docker compose $($composeArgs -join ' ')"

& docker compose @composeArgs
$testExitCode = $LASTEXITCODE

if ($testExitCode -ne 0) {
    Write-Host "Test run failed with exit code $testExitCode. Gathering backend logs..." -ForegroundColor Yellow
    & docker compose -p softarchitect-test -f docker-compose.test.yml logs backend
    & docker compose -p softarchitect-test -f docker-compose.test.yml down --volumes
    exit $testExitCode
} else {
    Write-Host "All tests passed (exit code 0)." -ForegroundColor Green
    & docker compose -p softarchitect-test -f docker-compose.test.yml down --volumes
    exit 0
}
