# cockpit-update: brings the cockpit mod to its latest version.
#
# Load it in every PowerShell by adding this line to your profile ($PROFILE):
#   . "<folder>\extras\cockpit-update.ps1"
# or paste the function below into the profile.
#
# - Loaded from a clone (CLAUDE_CODE_PLUGIN_DIRS in Claude Code's settings.json, or -Path):
#   git pull --ff-only; open sessions pick the new version up at the end of their next turn.
# - Installed from the marketplace: refreshes the marketplace and updates the plugin;
#   restart Claude Code to apply.
function cockpit-update {
    param([string]$Path)

    $isCockpit = {
        param($dir)
        $manifest = Join-Path $dir '.claude-plugin\plugin.json'
        (Test-Path -LiteralPath $manifest) -and ((Get-Content -LiteralPath $manifest -Raw) -match '"name"\s*:\s*"cockpit"')
    }

    $dirs = @()
    if ($Path) { $dirs += $Path }
    $settings = Join-Path $HOME '.claude\settings.json'
    if (Test-Path -LiteralPath $settings) {
        try {
            $fromSettings = (Get-Content -LiteralPath $settings -Raw | ConvertFrom-Json).env.CLAUDE_CODE_PLUGIN_DIRS
            if ($fromSettings) { $dirs += $fromSettings -split ';' }
        } catch { }
    }
    if ($env:CLAUDE_CODE_PLUGIN_DIRS) { $dirs += $env:CLAUDE_CODE_PLUGIN_DIRS -split ';' }
    $clone = $dirs | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ '.git')) -and (& $isCockpit $_) } | Select-Object -First 1

    if ($clone) {
        $before = (Get-Content -LiteralPath (Join-Path $clone '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version
        git -C $clone pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "cockpit: the clone has local changes or commits that are not on GitHub; nothing updated ($clone)"
            return
        }
        $after = (Get-Content -LiteralPath (Join-Path $clone '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version
        if ($before -eq $after) {
            Write-Host "cockpit $after is already the latest ($clone)"
        } else {
            Write-Host "cockpit $before -> $after. Open sessions load it at the end of their next turn."
        }
        return
    }

    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
        Write-Warning 'cockpit: claude is not in PATH'
        return
    }
    claude plugin marketplace update claude-code-cockpit
    claude plugin update cockpit@claude-code-cockpit
    if ($LASTEXITCODE -eq 0) { Write-Host 'cockpit updated. Restart Claude Code to apply.' }
}
