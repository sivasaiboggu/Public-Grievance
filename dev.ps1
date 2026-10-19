# GrievanceGrid Local Development Orchestrator
param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "reset", "status")]
    [string]$Action = "status"
)

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RepoRoot "backend"
$WebDir = Join-Path $RepoRoot "apps\web"

# Detect Python interpreter (virtualenv preferred)
$PythonPath = "python"
if (Test-Path "$BackendDir\.venv\Scripts\python.exe") {
    $PythonPath = "$BackendDir\.venv\Scripts\python.exe"
}

switch ($Action) {
    "start" {
        Write-Host "`n=== Starting GrievanceGrid Stack ===" -ForegroundColor Cyan
        
        # 1. Start Docker services (Postgres, Redis, Mailpit)
        if (Test-Path "$RepoRoot\docker-compose.dev.yml") {
            Write-Host "`n[1/4] Starting Docker services..." -ForegroundColor Yellow
            if ($env:DOCKER_HOST -like "*2375*") {
                Remove-Item Env:\DOCKER_HOST -ErrorAction SilentlyContinue
            }
            docker compose -f "$RepoRoot\docker-compose.dev.yml" up -d
        }

        # 2. Run Database Migrations
        Write-Host "`n[2/4] Running migrations..." -ForegroundColor Yellow
        Push-Location $BackendDir
        & $PythonPath -m alembic upgrade head
        Pop-Location

        # 3. Start Backend Services in dedicated windows
        Write-Host "`n[3/4] Launching API and workers..." -ForegroundColor Yellow
        
        # API Server
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; & '$PythonPath' -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
        
        # Celery Worker (solo pool for Windows)
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; & '$PythonPath' -m celery -A app.celery_app.celery worker --pool=solo --loglevel=info"
        
        # Celery Beat
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; & '$PythonPath' -m celery -A app.celery_app.celery beat --loglevel=info"

        # 4. Start Web Application
        Write-Host "`n[4/4] Launching Web frontend..." -ForegroundColor Yellow
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$WebDir'; npm run dev"

        Write-Host "`n=== All Services Launched ===" -ForegroundColor Green
        Write-Host "Web Application:  http://localhost:3000" -ForegroundColor White
        Write-Host "API Swagger Docs: http://localhost:8000/docs" -ForegroundColor White
        Write-Host "Mailpit Web UI:   http://localhost:8025" -ForegroundColor White
        Write-Host "`nTo seed initial Kochi demo data, run: .\dev.ps1 reset" -ForegroundColor Gray
    }

    "stop" {
        Write-Host "`n=== Stopping GrievanceGrid Stack ===" -ForegroundColor Cyan
        
        # Stop dev node and uvicorn processes
        Get-Process -Name "node", "python", "celery", "uvicorn" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$RepoRoot*" } | Stop-Process -Force
        
        if (Test-Path "$RepoRoot\docker-compose.dev.yml") {
            docker compose -f "$RepoRoot\docker-compose.dev.yml" stop
        }
        Write-Host "Services stopped." -ForegroundColor Green
    }

    "reset" {
        Write-Host "`n=== Resetting & Reseeding Kochi Demo Data ===" -ForegroundColor Cyan
        Push-Location $BackendDir
        & $PythonPath -m app.seed_demo --reset
        Pop-Location
        Write-Host "Reseed complete." -ForegroundColor Green
    }

    "status" {
        Write-Host "`n=== GrievanceGrid Status Check ===" -ForegroundColor Cyan
        
        $Ports = @(
            @{ Name = "Web Frontend"; Port = 3000 },
            @{ Name = "FastAPI Backend"; Port = 8000 },
            @{ Name = "Mailpit Web UI"; Port = 8025 },
            @{ Name = "PostgreSQL DB"; Port = 5432 },
            @{ Name = "Redis Cache"; Port = 6379 }
        )

        foreach ($p in $Ports) {
            $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port $p.Port -WarningAction SilentlyContinue
            if ($tcp.TcpTestSucceeded) {
                Write-Host "  [OK] $($p.Name) (Port $($p.Port)) is LISTENING" -ForegroundColor Green
            } else {
                Write-Host "  [--] $($p.Name) (Port $($p.Port)) is NOT REACHABLE" -ForegroundColor Yellow
            }
        }
    }
}
