import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, FileImage, Check, MapPin, AlertTriangle } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn, formatCoordinates } from '@/lib/utils'
import SensorChip from '@/components/ui/SensorChip'
import MagneticButton from '@/components/ui/MagneticButton'
import type { QueryImage, SensorType } from '@/types'

// File types the backend accepts
const ACCEPT = '.tif,.tiff,.png,.jpg,.jpeg'
const ACCEPT_LABEL = ['.tif', '.tiff', '.png', '.jpg', '.jpeg']

/** Infer sensor type from filename patterns */
function inferSensorType(name: string): SensorType {
  const n = name.toLowerCase()
  if (
    n.includes('sar') || n.includes('risat') ||
    n.includes('sentinel-1') || n.includes('s1a') || n.includes('s1b') ||
    n.includes('alos') || n.includes('palsar')
  ) return 'SAR'
  if (
    n.includes('msi') || n.includes('multi') ||
    n.includes('liss') || n.includes('resourcesat') ||
    n.includes('modis') || n.includes('viirs')
  ) return 'Multispectral'
  return 'Optical'
}

export default function UploadZone() {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef     = useRef<HTMLInputElement>(null)

  const uploadedImage    = useAppStore((s) => s.uploadedImage)
  const setUploadedImage = useAppStore((s) => s.setUploadedImage)
  const startSearch      = useAppStore((s) => s.startSearch)
  const isSearching      = useAppStore((s) => s.isSearching)
  const pipelineError    = useAppStore((s) => s.pipelineError)
  const setFocusedCoords = useAppStore((s) => s.setFocusedCoords)

  // Build a QueryImage from the real File object and store it
  const processFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = ['tif', 'tiff', 'png', 'jpg', 'jpeg']
    if (!allowed.includes(ext)) {
      console.warn('[AKSHA] Rejected file — unsupported type:', ext)
      return
    }

    // Browser can only render PNG / JPEG as <img> previews — TIFF shows a file icon
    const canPreview = ['png', 'jpg', 'jpeg'].includes(ext)
    const previewUrl = canPreview ? URL.createObjectURL(file) : ''

    const sensorType = inferSensorType(file.name)
    const fileSizeKb = (file.size / 1024).toFixed(1)

    const queryImage: QueryImage = {
      id:           `upload-${Date.now()}`,
      file,
      name:         file.name,
      sensorType,
      thumbnailUrl: previewUrl,
      fileSize:     `${fileSizeKb} KB`,
    }

    console.log('[AKSHA] File selected:', file.name, `${fileSizeKb} KB`, file.type, '→ sensor:', sensorType)
    setUploadedImage(queryImage)
  }, [setUploadedImage])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      console.log('[AKSHA] File dropped:', file.name)
      processFile(file)
    }
  }, [processFile])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }, [processFile])

  const clearImage = () => {
    // Revoke the object URL to free memory
    if (uploadedImage?.thumbnailUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(uploadedImage.thumbnailUrl)
    }
    setUploadedImage(null)
    console.log('[AKSHA] Upload cleared')
  }

  const handleBeginSearch = () => {
    if (!uploadedImage) {
      console.warn('[AKSHA] Begin Search clicked but no image is uploaded')
      return
    }
    if (!uploadedImage.file) {
      console.error('[AKSHA] uploadedImage.file is missing — cannot send to backend')
      return
    }
    console.log('[AKSHA] Begin Intelligence Search — starting pipeline for:', uploadedImage.name)
    startSearch()
  }

  return (
    <div className="space-y-3">

      {/* Hidden native file input — the only real file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleInputChange}
      />

      <AnimatePresence mode="wait">
        {!uploadedImage ? (
          <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="relative rounded-xl p-7 text-center cursor-pointer transition-all duration-200"
              style={{
                border: isDragging ? '1.5px dashed rgba(59,130,246,0.6)' : '1.5px dashed rgba(45,55,72,0.5)',
                background: isDragging ? 'rgba(59,130,246,0.06)' : 'rgba(17,24,39,0.4)',
              }}
            >
              <motion.div animate={isDragging ? { scale: 1.03 } : { scale: 1 }} className="flex flex-col items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: isDragging ? 'rgba(59,130,246,0.12)' : 'rgba(26,35,51,0.8)',
                    border: isDragging ? '1px solid rgba(59,130,246,0.25)' : '1px solid rgba(45,55,72,0.4)',
                  }}
                >
                  <Upload className={cn('w-5 h-5', isDragging ? 'text-blue-primary' : 'text-text-tertiary')} />
                </div>
                <div>
                  <div className="text-body-s text-text-secondary font-medium">
                    {isDragging ? 'Release to set as query scene' : 'Drop query scene here'}
                  </div>
                  <div className="text-caption text-text-tertiary mt-1">SAR · Optical · Multispectral supported</div>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                  {ACCEPT_LABEL.map((f) => (
                    <span key={f} className="px-2 py-0.5 text-caption text-text-tertiary"
                      style={{ background: 'rgba(26,35,51,0.6)', border: '1px solid rgba(45,55,72,0.4)', borderRadius: 4 }}>
                      {f}
                    </span>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="uploaded" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(17,24,39,0.6)', border: '1px solid rgba(45,55,72,0.4)' }}>

            <div className="flex items-start gap-3 p-4">
              {/* Thumbnail — object URL for PNG/JPEG, file icon for TIFF */}
              <div className="w-20 h-16 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
                style={{ background: 'rgba(26,35,51,0.8)', border: '1px solid rgba(45,55,72,0.3)' }}>
                {uploadedImage.thumbnailUrl ? (
                  <img src={uploadedImage.thumbnailUrl} alt="Query preview" className="w-full h-full object-cover" />
                ) : (
                  <FileImage className="w-7 h-7 text-text-tertiary" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileImage className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                    <span className="text-body-s text-text-primary font-medium truncate">{uploadedImage.name}</span>
                  </div>
                  <button onClick={clearImage} className="btn-ghost p-0.5 flex-shrink-0" title="Remove image">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <SensorChip type={uploadedImage.sensorType} size="sm" />
                    {uploadedImage.satellite && (
                      <span className="text-caption text-text-tertiary">{uploadedImage.satellite}</span>
                    )}
                  </div>
                  {uploadedImage.fileSize && (
                    <div className="text-caption text-text-tertiary font-mono">{uploadedImage.fileSize}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Location badge — only shown if backend parsed coordinates */}
            {uploadedImage.detectedRegion && (
              <div className="mx-4 mb-4 px-3 py-2.5 rounded-lg"
                style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-3 h-3 text-blue-primary flex-shrink-0" />
                  <span className="text-body-s text-blue-primary font-medium">{uploadedImage.detectedRegion}</span>
                </div>
                {uploadedImage.coords && (
                  <div className="font-mono text-caption text-text-tertiary ml-5">
                    {formatCoordinates(uploadedImage.coords.lat, uploadedImage.coords.lng)}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 ml-5">
                  <Check className="w-3 h-3 text-teal-primary" />
                  <span className="text-caption text-teal-primary">Marked on globe</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pipeline error — shown prominently when backend fails */}
      <AnimatePresence>
        {pipelineError && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.32)' }}>
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-caption text-red-400 font-medium">Pipeline Error</div>
              <div className="text-caption text-red-400/80 leading-relaxed mt-0.5">{pipelineError}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MagneticButton
        onClick={handleBeginSearch}
        disabled={!uploadedImage || isSearching}
        strength={uploadedImage && !isSearching ? 0.3 : 0}
        className="btn-primary w-full disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSearching ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Running Retrieval…
          </>
        ) : (
          'Run Cross-Modal Retrieval'
        )}
      </MagneticButton>
    </div>
  )
}
