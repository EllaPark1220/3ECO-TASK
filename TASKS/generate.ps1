$content = Get-Content "0. TASK_LIST.md" -Encoding UTF8
$tasks = @()

foreach ($line in $content) {
    if ($line.Trim().StartsWith('| **')) {
        $parts = $line.Split('|') | ForEach-Object { $_.Trim() }
        if ($parts.Length -ge 7) {
            $id = $null
            if ($parts[1] -match '\*\*(.+?)\*\*') {
                $id = $matches[1]
            }
            if (-not $id -or -not ($id -match '^[A-Z]+-[A-Z0-9]+-[0-9]+$')) { continue }

            $title = $parts[3] -replace '"',"'" -replace '\[|\]|\(|\)', ''
            if ($title.Length -gt 40) { $title = $title.Substring(0, 40) }
            
            $depsRaw = $parts[5]
            $deps = @()
            if ($depsRaw -and $depsRaw -ne 'None') {
                $depParts = $depsRaw -split '[,·&]' | ForEach-Object { $_.Trim() }
                foreach ($dep in $depParts) {
                    if ($dep -match '([A-Z]+-[A-Z0-9]+-)(\d+)~(\d+)') {
                        $prefix = $matches[1]
                        $start = [int]$matches[2]
                        $end = [int]$matches[3]
                        $len = $matches[2].Length
                        for ($i = $start; $i -le $end; $i++) {
                            $padded = $i.ToString("D$len")
                            $deps += "$prefix$padded"
                        }
                    } else {
                        $idMatches = [regex]::Matches($dep, '[A-Z]+-[A-Z0-9]+-[0-9]+')
                        foreach ($m in $idMatches) {
                            $deps += $m.Value
                        }
                    }
                }
            }
            
            $group = "OTHER"
            if ($id.StartsWith("CT-DB")) { $group = "DB" }
            elseif ($id.StartsWith("CT-API")) { $group = "API" }
            elseif ($id.StartsWith("CT-MOCK")) { $group = "MOCK" }
            elseif ($id.StartsWith("FW-")) { $group = "WRITE" }
            elseif ($id.StartsWith("FR-")) { $group = "READ" }
            elseif ($id.StartsWith("TS-")) { $group = "TEST" }
            elseif ($id.StartsWith("IF-")) { $group = "INFRA" }
            elseif ($id.StartsWith("NF-")) { $group = "NON_FUNC" }
            
            $tasks += [PSCustomObject]@{
                id = $id
                title = $title
                deps = $deps
                group = $group
            }
        }
    }
}

$taskSet = @{}
foreach ($t in $tasks) {
    $taskSet[$t.id] = $true
}

$mermaid = "``````mermaid`ngraph TD`n"
$mermaid += "    classDef DB fill:#2c5282,stroke:#3182ce,color:#fff;`n"
$mermaid += "    classDef API fill:#276749,stroke:#38a169,color:#fff;`n"
$mermaid += "    classDef MOCK fill:#2f855a,stroke:#38a169,color:#fff;`n"
$mermaid += "    classDef WRITE fill:#744210,stroke:#d69e2e,color:#fff;`n"
$mermaid += "    classDef READ fill:#b7791f,stroke:#d69e2e,color:#fff;`n"
$mermaid += "    classDef TEST fill:#97266d,stroke:#d53f8c,color:#fff;`n"
$mermaid += "    classDef INFRA fill:#2d3748,stroke:#4a5568,color:#fff;`n"
$mermaid += "    classDef NON_FUNC fill:#c53030,stroke:#e53e3e,color:#fff;`n`n"

$groups = @("DB", "API", "MOCK", "WRITE", "READ", "TEST", "INFRA", "NON_FUNC", "OTHER")

foreach ($g in $groups) {
    $groupTasks = $tasks | Where-Object { $_.group -eq $g }
    if ($groupTasks.Count -gt 0) {
        $mermaid += "    subgraph $g`n"
        foreach ($t in $groupTasks) {
            $safeId = $t.id -replace '-', '_'
            $mermaid += "        $safeId`[`"$($t.id): $($t.title)`"`]:::$g`n"
        }
        $mermaid += "    end`n`n"
    }
}

foreach ($t in $tasks) {
    $safeId = $t.id -replace '-', '_'
    foreach ($dep in $t.deps) {
        if ($taskSet.ContainsKey($dep)) {
            $safeDep = $dep -replace '-', '_'
            $mermaid += "    $safeDep --> $safeId`n"
        }
    }
}

$mermaid += "```````n"

[IO.File]::WriteAllText("$(Get-Location)\0. TASK_DEPENDENCY_GRAPH.md", $mermaid, [System.Text.Encoding]::UTF8)
