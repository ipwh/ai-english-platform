$lines = Get-Content "src/modules/ai/services/ai-service.ts"
$functions = @{
    "analyze-word" = @{start=266; end=333; name="analyzeWord"}
    "analyze-progress" = @{start=336; end=419; name="analyzeProgress"}
    "study-help" = @{start=421; end=521; name="answerStudyHelp"}
    "analyze-material" = @{start=523; end=613; name="analyzeMaterial"}
    "writing-prompt" = @{start=615; end=691; name="generateWritingPrompt"}
    "writing-outline" = @{start=693; end=750; name="generateWritingOutline"}
}
foreach ($key in $functions.Keys) {
    $f = $functions[$key]
    $body = $lines[($f.start-1)..($f.end-1)] -join "`n"
    Write-Host "$key : lines $($f.start)-$($f.end) = $($body.Split(\"`n\").Length)"
}
