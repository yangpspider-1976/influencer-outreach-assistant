param(
  [string]$InputPath = "docs\MANUAL_TESTING_GUIDE.md",
  [string]$OutputPath = "docs\MANUAL_TESTING_GUIDE.docx"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Escape-Xml([string]$Value) {
  [System.Security.SecurityElement]::Escape($Value) -replace "`r?`n", '&#xA;'
}

function Clean-Markdown([string]$Value) {
  $clean = $Value.Trim()
  $clean = $clean -replace '`', '' -replace '\*\*', '' -replace '\*', ''
  $clean = $clean -replace '\[([^\]]+)\]\([^)]+\)', '$1'
  return $clean
}

function Convert-InlineMarkdownToRuns([string]$Value, [string]$RunOptions) {
  $inline = $Value.Trim()
  $inline = $inline -replace '\[([^\]]+)\]\([^)]+\)', '$1'
  $segments = [regex]::Split($inline, '(\*\*.*?\*\*)')
  $runs = [System.Text.StringBuilder]::new()

  foreach ($segment in $segments) {
    if ([string]::IsNullOrEmpty($segment)) { continue }
    $isBold = $segment.StartsWith('**') -and $segment.EndsWith('**') -and $segment.Length -ge 4
    $plain = if ($isBold) { $segment.Substring(2, $segment.Length - 4) } else { $segment }
    $plain = $plain -replace '`', '' -replace '\*', ''
    if ([string]::IsNullOrEmpty($plain)) { continue }

    $bold = if ($isBold) { '<w:b/><w:bCs/>' } else { '' }
    $escaped = Escape-Xml $plain
    [void]$runs.Append("<w:r><w:rPr>$RunOptions$bold</w:rPr><w:t xml:space=`"preserve`">$escaped</w:t></w:r>")
  }

  return $runs.ToString()
}

function New-Paragraph([string]$Text, [string]$Style = 'Body') {
  $font = 'Arial'
  $size = '21'
  $colour = '263238'
  $bold = ''
  $paragraphOptions = '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>'
  switch ($Style) {
    'Title' {
      $size = '54'; $colour = '17365D'; $bold = '<w:b/>'
      $paragraphOptions = '<w:keepNext/><w:spacing w:before="300" w:after="360"/>'
    }
    'Heading1' {
      $size = '36'; $colour = '17365D'; $bold = '<w:b/>'
      $paragraphOptions = '<w:keepNext/><w:spacing w:before="360" w:after="160"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="6" w:color="9EADBA"/></w:pBdr>'
    }
    'Heading2' {
      $size = '28'; $colour = '2F5597'; $bold = '<w:b/>'
      $paragraphOptions = '<w:keepNext/><w:spacing w:before="260" w:after="120"/>'
    }
    'Bullet' {
      $paragraphOptions = '<w:ind w:left="420" w:hanging="210"/><w:spacing w:after="80" w:line="276" w:lineRule="auto"/>'
    }
    'Code' {
      $font = 'Consolas'; $size = '18'; $colour = '334155'
      $paragraphOptions = '<w:shd w:fill="F1F5F9"/><w:ind w:left="180" w:right="180"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'
    }
  }
  $runOptions = "<w:rFonts w:ascii=`"$font`" w:hAnsi=`"$font`" w:eastAsia=`"$font`"/><w:sz w:val=`"$size`"/><w:szCs w:val=`"$size`"/><w:color w:val=`"$colour`"/>$bold"
  $runs = Convert-InlineMarkdownToRuns $Text $runOptions
  return "<w:p><w:pPr><w:pStyle w:val=`"$Style`"/>$paragraphOptions</w:pPr>$runs</w:p>"
}

function New-Table([object[]]$Rows) {
  $xml = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="autofit"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar><w:tblBorders><w:top w:val="single" w:sz="6" w:color="A8BAC8"/><w:left w:val="single" w:sz="6" w:color="A8BAC8"/><w:bottom w:val="single" w:sz="6" w:color="A8BAC8"/><w:right w:val="single" w:sz="6" w:color="A8BAC8"/><w:insideH w:val="single" w:sz="4" w:color="D5DEE5"/><w:insideV w:val="single" w:sz="4" w:color="D5DEE5"/></w:tblBorders></w:tblPr>'
  for ($rowIndex = 0; $rowIndex -lt $Rows.Count; $rowIndex++) {
    $rowOptions = if ($rowIndex -eq 0) { '<w:tblHeader/><w:cantSplit/>' } else { '<w:cantSplit/>' }
    $xml += "<w:tr><w:trPr>$rowOptions</w:trPr>"
    foreach ($cell in $Rows[$rowIndex]) {
      $shade = if ($rowIndex -eq 0) { '<w:shd w:fill="1F4E78"/>' } elseif ($rowIndex % 2 -eq 0) { '<w:shd w:fill="F3F6F8"/>' } else { '<w:shd w:fill="FFFFFF"/>' }
      $colour = if ($rowIndex -eq 0) { 'FFFFFF' } else { '263238' }
      $bold = if ($rowIndex -eq 0) { '<w:b/>' } else { '' }
      $runOptions = "<w:rFonts w:ascii=`"Arial`" w:hAnsi=`"Arial`" w:eastAsia=`"Arial`"/><w:sz w:val=`"19`"/><w:szCs w:val=`"19`"/><w:color w:val=`"$colour`"/>$bold"
      $runs = Convert-InlineMarkdownToRuns $cell $runOptions
      $xml += "<w:tc><w:tcPr><w:vAlign w:val=`"top`"/>$shade</w:tcPr><w:p><w:pPr><w:pStyle w:val=`"TableText`"/><w:spacing w:after=`"40`" w:line=`"240`" w:lineRule=`"auto`"/></w:pPr>$runs</w:p></w:tc>"
    }
    $xml += '</w:tr>'
  }
  return $xml + '</w:tbl><w:p/>'
}

function Write-ZipEntry([System.IO.Compression.ZipArchive]$Archive, [string]$Name, [string]$Contents) {
  $entry = $Archive.CreateEntry($Name)
  $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
  try { $writer.Write($Contents) } finally { $writer.Dispose() }
}

if (-not (Test-Path -LiteralPath $InputPath)) { throw "Input file not found: $InputPath" }

$resolvedInputPath = (Resolve-Path -LiteralPath $InputPath).Path
$lines = [System.IO.File]::ReadAllLines($resolvedInputPath, [System.Text.UTF8Encoding]::new($false))
$body = [System.Text.StringBuilder]::new()
$inCodeBlock = $false
$tableRows = [System.Collections.Generic.List[object]]::new()

function Flush-Table {
  if ($tableRows.Count -gt 0) {
    [void]$body.Append((New-Table @($tableRows.ToArray())))
    $tableRows.Clear()
  }
}

foreach ($line in $lines) {
  if ($line -match '^\s*\|.*\|\s*$') {
    $cells = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
    if ($cells -notmatch '^:?-{3,}:?$') { $tableRows.Add($cells) }
    continue
  }
  Flush-Table
  if ($line -match '^```') { $inCodeBlock = -not $inCodeBlock; continue }
  if ($inCodeBlock) { [void]$body.Append((New-Paragraph $line 'Code')); continue }
  if ($line -match '^# (.+)$') { [void]$body.Append((New-Paragraph $Matches[1] 'Title')); continue }
  if ($line -match '^## (.+)$') { [void]$body.Append((New-Paragraph $Matches[1] 'Heading1')); continue }
  if ($line -match '^### (.+)$') { [void]$body.Append((New-Paragraph $Matches[1] 'Heading2')); continue }
  if ($line -match '^---+$') { [void]$body.Append('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="9EADBA"/></w:pBdr></w:pPr></w:p>'); continue }
  if ($line -match '^\s*- (.+)$') { [void]$body.Append((New-Paragraph (([char]0x2022) + " $($Matches[1])") 'Bullet')); continue }
  if ([string]::IsNullOrWhiteSpace($line)) { [void]$body.Append('<w:p/>'); continue }
  [void]$body.Append((New-Paragraph $line 'Body'))
}
Flush-Table

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>
'@
$relationships = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>
'@
$documentRelationships = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>
'@
$styles = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="263238"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Body"><w:name w:val="Body"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Body"/><w:next w:val="Body"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Body"/><w:next w:val="Body"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Body"/><w:next w:val="Body"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Bullet"><w:name w:val="Bullet"/><w:basedOn w:val="Body"/></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Body"/></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Body"/></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>
'@
$document = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><w:document xmlns:w=`"http://schemas.openxmlformats.org/wordprocessingml/2006/main`"><w:body>$($body.ToString())<w:sectPr><w:pgSz w:w=`"12240`" w:h=`"15840`"/><w:pgMar w:top=`"1080`" w:right=`"1080`" w:bottom=`"1080`" w:left=`"1080`"/></w:sectPr></w:body></w:document>"
$core = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><cp:coreProperties xmlns:cp=`"http://schemas.openxmlformats.org/package/2006/metadata/core-properties`" xmlns:dc=`"http://purl.org/dc/elements/1.1/`" xmlns:dcterms=`"http://purl.org/dc/terms/`"><dc:title>QROAD Manual Testing Checklist</dc:title><dc:creator>QROAD</dc:creator><dcterms:created xsi:type=`"dcterms:W3CDTF`" xmlns:xsi=`"http://www.w3.org/2001/XMLSchema-instance`">$(Get-Date -Format s)Z</dcterms:created></cp:coreProperties>"
$app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>QROAD</Application></Properties>'

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }
$archive = [System.IO.Compression.ZipFile]::Open((Resolve-Path -LiteralPath $outputDirectory).Path + '\' + (Split-Path -Leaf $OutputPath), [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Write-ZipEntry $archive '[Content_Types].xml' $contentTypes
  Write-ZipEntry $archive '_rels/.rels' $relationships
  Write-ZipEntry $archive 'word/document.xml' $document
  Write-ZipEntry $archive 'word/_rels/document.xml.rels' $documentRelationships
  Write-ZipEntry $archive 'word/styles.xml' $styles
  Write-ZipEntry $archive 'docProps/core.xml' $core
  Write-ZipEntry $archive 'docProps/app.xml' $app
} finally { $archive.Dispose() }

Write-Output "Created $OutputPath"
