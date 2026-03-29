import { useState, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => item.str).join(' '))
  }
  return pages.join('\n\n')
}

async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

const SYSTEM_PROMPT = `You are a ruthlessly honest executive resume coach with experience placing McKinsey alumni and senior operators at top-tier companies. Evaluate this resume with zero sugar-coating. Return ONLY this JSON structure:
{
  "overall_score": n,
  "dimensions": {
    "quantification": n,
    "formatting": n,
    "skill_mix": n,
    "relevance": n,
    "executive_positioning": n
  },
  "inline_fixes": [
    { "quote": "exact quote from resume", "issue": "what's wrong", "rewrite": "suggested replacement" }
  ],
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "hiring_manager_read": "one paragraph summary"
}
Penalize heavily for: vague bullets with no metrics, passive language, task-listing without outcomes, inconsistent formatting signals, anything that reads as junior. The inline_fixes array must contain exactly 5 items — the 5 most important fixes. Each score is 0-100. No preamble. JSON only.`

function ScoreGauge({ score }) {
  const color = score < 60 ? '#ef4444' : score < 80 ? '#f59e0b' : '#22c55e'
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r="54" fill="none" stroke="#1a1a1a" strokeWidth="12" />
        <circle
          cx="70" cy="70" r="54" fill="none"
          stroke={color} strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-neutral-500">/ 100</span>
      </div>
    </div>
  )
}

function DimensionBar({ label, score }) {
  const color = score < 60 ? '#ef4444' : score < 80 ? '#f59e0b' : '#22c55e'
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-sm text-neutral-300">{label}</span>
        <span className="text-sm font-semibold" style={{ color }}>{score}</span>
      </div>
      <div className="w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function FixCard({ fix, index }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 fade-in" style={{ animationDelay: `${index * 100}ms` }}>
      <div className="flex items-start gap-3 mb-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-red-900/50 text-red-400 flex items-center justify-center text-xs font-bold">{index + 1}</span>
        <div>
          <p className="text-red-400 text-sm font-medium mb-1">Issue: {fix.issue}</p>
          <p className="text-neutral-400 text-sm italic border-l-2 border-neutral-700 pl-3">"{fix.quote}"</p>
        </div>
      </div>
      <div className="ml-9">
        <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Suggested Rewrite</p>
        <p className="text-sm text-green-400 bg-green-950/30 rounded p-2">{fix.rewrite}</p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 mt-8">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
        <p className="text-[#D4AF37] font-medium">Analyzing resume — this takes 15-30 seconds...</p>
      </div>
      <div className="shimmer h-36 rounded-lg" />
      <div className="shimmer h-48 rounded-lg" />
      <div className="shimmer h-64 rounded-lg" />
    </div>
  )
}

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const fileInputRef = useRef(null)

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'doc'].includes(ext)) {
      setError('Please upload a .pdf or .docx file.')
      return
    }
    setError('')
    setFileLoading(true)
    setFileName(file.name)
    try {
      let text = ''
      if (ext === 'pdf') {
        text = await extractTextFromPdf(file)
      } else {
        text = await extractTextFromDocx(file)
      }
      if (!text.trim()) {
        setError('Could not extract text from the file. Try pasting the resume text instead.')
        setFileName('')
      } else {
        setResumeText(text)
      }
    } catch (err) {
      setError(`Failed to read file: ${err.message}`)
      setFileName('')
    } finally {
      setFileLoading(false)
    }
  }

  function clearFile() {
    setFileName('')
    setResumeText('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function evaluateResume() {
    if (!apiKey.trim()) return setError('Please enter your Anthropic API key.')
    if (!resumeText.trim()) return setError('Please paste your resume text.')
    setError('')
    setResult(null)
    setLoading(true)

    const userMessage = jobDescription.trim()
      ? `RESUME:\n${resumeText}\n\nTARGET JOB DESCRIPTION:\n${jobDescription}`
      : `RESUME:\n${resumeText}`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error?.message || `API error: ${response.status}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      const parsed = JSON.parse(text)
      setResult(parsed)
    } catch (err) {
      setError(err.message || 'Something went wrong. Check your API key and try again.')
    } finally {
      setLoading(false)
    }
  }

  const dimensionLabels = {
    quantification: 'Quantification',
    formatting: 'Formatting Consistency',
    skill_mix: 'Skill Mix',
    relevance: 'Relevance & Concision',
    executive_positioning: 'Executive Positioning',
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-black/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D4AF37] to-[#B8960C] flex items-center justify-center">
            <span className="text-black font-bold text-sm">RE</span>
          </div>
          <h1 className="text-lg font-semibold text-white">Resume Evaluator</h1>
          <span className="text-xs text-neutral-500 ml-1">by Career Advisory</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* API Key */}
        <div className="mb-6 bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
          <label className="block text-sm text-neutral-400 mb-2">
            Anthropic API Key
            <span className="text-neutral-600 ml-2 text-xs">(never stored — session only)</span>
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-400 hover:text-white transition-colors"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Resume <span className="text-red-400">*</span>
            </label>

            {/* File Upload Zone */}
            <div
              className="mb-3 border-2 border-dashed border-neutral-700 rounded-lg p-4 text-center hover:border-[#D4AF37]/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#D4AF37]') }}
              onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#D4AF37]') }}
              onDrop={e => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-[#D4AF37]')
                const file = e.dataTransfer.files?.[0]
                if (file) {
                  const dt = new DataTransfer()
                  dt.items.add(file)
                  fileInputRef.current.files = dt.files
                  handleFileUpload({ target: { files: dt.files } })
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                onChange={handleFileUpload}
                className="hidden"
              />
              {fileLoading ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-neutral-400">Extracting text...</span>
                </div>
              ) : fileName ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <svg className="w-4 h-4 text-[#D4AF37]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="text-sm text-neutral-300">{fileName}</span>
                  <button onClick={e => { e.stopPropagation(); clearFile() }} className="text-xs text-neutral-500 hover:text-red-400 ml-2">Remove</button>
                </div>
              ) : (
                <div className="py-2">
                  <svg className="w-6 h-6 mx-auto text-neutral-600 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <p className="text-sm text-neutral-400">Drop a <span className="text-[#D4AF37]">.pdf</span> or <span className="text-[#D4AF37]">.docx</span> here, or click to browse</p>
                  <p className="text-xs text-neutral-600 mt-1">Text is extracted locally — nothing leaves your browser</p>
                </div>
              )}
            </div>

            <div className="text-xs text-neutral-600 mb-1 text-center">— or paste text directly —</div>
            <textarea
              value={resumeText}
              onChange={e => { setResumeText(e.target.value); if (fileName) { setFileName(''); if (fileInputRef.current) fileInputRef.current.value = '' } }}
              placeholder="Paste the full text of the resume here..."
              rows={10}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Target Job Description <span className="text-neutral-600">(optional)</span>
            </label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Paste a job description to evaluate fit and relevance..."
              rows={14}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
          </div>
        </div>

        {/* Evaluate Button */}
        <button
          onClick={evaluateResume}
          disabled={loading}
          className="w-full py-3 rounded-lg font-semibold text-black bg-gradient-to-r from-[#D4AF37] to-[#F0D060] hover:from-[#B8960C] hover:to-[#D4AF37] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm tracking-wide"
        >
          {loading ? 'Analyzing...' : 'Evaluate Resume'}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-950/50 border border-red-900 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && <LoadingSkeleton />}

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-6 fade-in">
            {/* Overall Score + Dimensions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Overall Score */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 flex flex-col items-center justify-center">
                <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">Overall Score</h2>
                <ScoreGauge score={result.overall_score} />
              </div>

              {/* Dimensions */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
                <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">Dimension Scores</h2>
                {Object.entries(result.dimensions).map(([key, score]) => (
                  <DimensionBar key={key} label={dimensionLabels[key] || key} score={score} />
                ))}
              </div>
            </div>

            {/* Hiring Manager Read */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
              <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">How a Hiring Manager Reads This</h2>
              <p className="text-neutral-300 text-sm leading-relaxed">{result.hiring_manager_read}</p>
            </div>

            {/* Strengths */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
              <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">What's Working</h2>
              <div className="space-y-2">
                {result.strengths.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[#D4AF37] mt-0.5">&#10003;</span>
                    <p className="text-neutral-300 text-sm">{s}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Inline Fixes */}
            <div>
              <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-4">Top 5 Fixes</h2>
              <div className="space-y-4">
                {result.inline_fixes.map((fix, i) => (
                  <FixCard key={i} fix={fix} index={i} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 mt-12 py-6 text-center text-xs text-neutral-600">
        Resume Evaluator &mdash; Powered by Claude
      </footer>
    </div>
  )
}
