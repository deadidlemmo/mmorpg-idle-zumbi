param(
  [int]$Limit = 30,
  [double]$MinimumSizeMb = 5
)

$ErrorActionPreference = 'Stop'
$minimumBytes = [math]::Round($MinimumSizeMb * 1MB)
$rows = git rev-list --objects --all |
  git cat-file --batch-check='%(objectname) %(objecttype) %(objectsize) %(rest)'

$largest = $rows |
  ForEach-Object {
    $parts = $_ -split ' ', 4
    if ($parts.Count -lt 4 -or $parts[1] -ne 'blob') { return }

    [pscustomobject]@{
      Hash = $parts[0]
      SizeBytes = [int64]$parts[2]
      SizeMb = [math]::Round(([int64]$parts[2] / 1MB), 2)
      Path = $parts[3]
    }
  } |
  Where-Object { $_.SizeBytes -ge $minimumBytes } |
  Sort-Object SizeBytes -Descending |
  Select-Object -First $Limit

$largest | Format-Table SizeMb, Hash, Path -AutoSize

$packSize = git count-objects -vH |
  Where-Object { $_ -match '^(size-pack|size):' }

Write-Output ''
Write-Output 'Git object storage:'
$packSize
