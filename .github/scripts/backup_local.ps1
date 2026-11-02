<#
Sauvegarde locale du projet Supabase NVG.
Cree une archive ZIP dans le dossier de destination. Rien n'est envoye sur GitHub.

Prerequis :
- pg_dump 17 (outils clients PostgreSQL 17)
- Supabase CLI (supabase.exe dans le PATH, ou chemin via -SupabaseCli)
- Variable utilisateur Windows SUPABASE_ACCESS_TOKEN

Usage :
  .\backup_local.ps1
  (l'URL de la base est demandee si la variable SUPABASE_DB_URL n'est pas definie)
#>
[CmdletBinding()]
param(
  [string]$Dest = 'C:\Sauvegarde APP NVG',
  [string]$ProjectRef = 'fxewefwwpowhnacrxfdp',
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [string]$SupabaseCli = 'supabase'
)

$ErrorActionPreference = 'Stop'

$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN introuvable (variable utilisateur Windows).' }

$pgDump = Join-Path $PgBin 'pg_dump.exe'
if (-not (Test-Path $pgDump)) { throw "pg_dump introuvable : $pgDump" }

$dbUrl = [Environment]::GetEnvironmentVariable('SUPABASE_DB_URL', 'User')
if (-not $dbUrl) { $dbUrl = $env:SUPABASE_DB_URL }
if (-not $dbUrl) {
  $secure = Read-Host 'URL Session pooler de la base ([YOUR-PASSWORD] accepte)' -AsSecureString
  $dbUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if ($dbUrl.Contains('[YOUR-PASSWORD]')) {
  $passwordFile = Join-Path $Dest 'db-password.txt'
  $template = $dbUrl
  $attempt = 0
  while ($true) {
    $attempt++
    $secure = $null
    if (Test-Path $passwordFile) {
      try { $secure = Get-Content $passwordFile | ConvertTo-SecureString } catch { $secure = $null }
    }
    if (-not $secure) {
      $secure = Read-Host 'Mot de passe de la base' -AsSecureString
      New-Item -ItemType Directory -Force -Path (Split-Path $passwordFile) | Out-Null
      $secure | ConvertFrom-SecureString | Set-Content -Path $passwordFile
    }
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    $dbUrl = $template.Replace('[YOUR-PASSWORD]', [Uri]::EscapeDataString($plain))

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $testOutput = & $pgDump $dbUrl --schema-only --schema=cron --file NUL 2>&1
    $testCode = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference

    if ($testCode -eq 0) { break }
    $message = ($testOutput | Out-String)
    if ($message -notmatch 'authentication failed') {
      throw "Connexion a la base impossible : $message"
    }
    Remove-Item $passwordFile -Force -ErrorAction SilentlyContinue
    if ($attempt -ge 3) { throw 'Mot de passe refuse 3 fois. Verifie-le dans le tableau de bord Supabase.' }
    Write-Warning 'Mot de passe refuse. Ressaisis-le.'
  }
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$name = "nvg-supabase-$stamp"
$work = Join-Path $env:TEMP $name
$api = "https://api.supabase.com/v1/projects/$ProjectRef"
$headers = @{ Authorization = "Bearer $token" }

New-Item -ItemType Directory -Force -Path $Dest, "$work\db", "$work\config", "$work\storage" | Out-Null

function Invoke-Pg {
  & $pgDump $dbUrl --no-owner --no-privileges @args
  if ($LASTEXITCODE -ne 0) { throw "pg_dump a echoue : $args" }
}

try {
  Write-Host 'Base de donnees...'
  Invoke-Pg '--format=custom' '--file' "$work\db\full.dump"
  Invoke-Pg '--schema-only' '--schema=public' '--file' "$work\db\public-schema.sql"
  Invoke-Pg '--data-only' '--schema=public' '--file' "$work\db\public-data.sql"
  Invoke-Pg '--data-only' '--schema=auth' '--file' "$work\db\auth-data.sql"
  Invoke-Pg '--data-only' '--schema=storage' '--file' "$work\db\storage-data.sql"
  $psql = Join-Path $PgBin 'psql.exe'
  $cronSql = "select format('select cron.schedule(%L, %L, %L);', jobname, schedule, command) from cron.job order by jobid;"
  & $psql $dbUrl --no-psqlrc --tuples-only --no-align --command $cronSql --output "$work\db\cron-jobs.sql"
  if ($LASTEXITCODE -ne 0) { throw 'Export des taches pg_cron echoue.' }

  Write-Host 'Fonctions Edge...'
  New-Item -ItemType Directory -Force -Path "$work\fn" | Out-Null
  & $SupabaseCli functions download --project-ref $ProjectRef --use-api --yes --workdir "$work\fn"
  if ($LASTEXITCODE -ne 0) { throw 'Telechargement des fonctions echoue.' }
  Move-Item "$work\fn\supabase\functions" "$work\functions"
  Remove-Item "$work\fn" -Recurse -Force

  Write-Host 'Storage...'
  $buckets = Invoke-RestMethod -Uri "$api/storage/buckets" -Headers $headers
  Push-Location "$work\storage"
  try {
    foreach ($bucket in $buckets) {
      Write-Host "   bucket $($bucket.name)"
      & $SupabaseCli storage cp -r "ss:///$($bucket.name)" . --project-ref $ProjectRef --experimental --yes
      if ($LASTEXITCODE -ne 0) { Write-Warning "Bucket $($bucket.name) non telecharge." }
    }
  } finally {
    Pop-Location
  }
  Remove-Item "$work\storage\supabase" -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host 'Configuration...'
  $configs = [ordered]@{
    'project'       = ''
    'auth'          = 'config/auth'
    'storage'       = 'config/storage'
    'realtime'      = 'config/realtime'
    'postgrest'     = 'postgrest'
    'pooler'        = 'config/database/pooler'
    'edge-secrets'  = 'secrets'
    'api-keys'      = 'api-keys'
    'buckets'       = 'storage/buckets'
  }
  foreach ($key in $configs.Keys) {
    $path = $configs[$key]
    $url = if ($path) { "$api/$path" } else { $api }
    Invoke-RestMethod -Uri $url -Headers $headers |
      ConvertTo-Json -Depth 20 |
      Set-Content -Encoding UTF8 -Path "$work\config\$key.json"
  }

  $manifest = @(
    'Sauvegarde Supabase - Normandy Viking Gaming'
    "Projet : $ProjectRef"
    "Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    ''
    'Fichiers :'
  )
  $manifest += Get-ChildItem $work -Recurse -File | ForEach-Object {
    '{0}  ({1} octets)' -f $_.FullName.Substring($work.Length + 1), $_.Length
  }
  $manifest | Set-Content -Encoding UTF8 -Path "$work\MANIFEST.txt"

  $zip = Join-Path $Dest "$name.zip"
  Compress-Archive -Path "$work\*" -DestinationPath $zip -CompressionLevel Optimal
  Write-Host "Sauvegarde creee : $zip"
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
