import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, FileImage, Check, MapPin } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn, formatCoordinates } from '@/lib/utils'
import { mockQueryImage } from '@/data/mockResults'
import SensorChip from '@/components/ui/SensorChip'

export default function UploadZone() {
  const [isDragging, setIsDragging] = useState(false)
  const uploadedImage     = useAppStore((s) => s.uploadedImage)
  const setUploadedImage  = useAppStore((s) => s.setUploadedImage)
  const startSearch       = useAppStore((s) => s.startSearch)
  const isSearching       = useAppStore((s) => s.isSearching)
  const setFocusedCoords  = useAppStore((s) => s.setFocusedCoords)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setUploadedImage(mockQueryImage)
    if (mockQueryImage.coords) setFocusedCoords(mockQueryImage.coords)
  }, [setUploadedImage, setFocusedCoords])

  const handleFileSelect = () => {
    setUploadedImage(mockQueryImage)
    if (mockQueryImage.coords) setFocusedCoords(mockQueryImage.coords)
  }

  const clearImage = () => setUploadedImage(null)

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait">
        {!uploadedImage ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={handleFileSelect}
              className="relative rounded-xl p-7 text-center cursor-pointer transition-all duration-200"
              style={{
                border: isDragging
                  ? '1.5px dashed rgba(59,130,246,0.6)'
                  : '1.5px dashed rgba(45,55,72,0.5)',
                background: isDragging
                  ? 'rgba(59,130,246,0.06)'
                  : 'rgba(17,24,39,0.4)',
              }}
            >
              <motion.div
                animate={isDragging ? { scale: 1.03 } : { scale: 1 }}
                className="flex flex-col items-center gap-3"
              >
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
                    {isDragging ? 'Release to upload' : 'Drop image here'}
                  </div>
                  <div className="text-caption text-text-tertiary mt-1">or click to select a file</div>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                  {['.tif / .h5', '.tif', '.nc / .hdf'].map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 text-caption text-text-tertiary"
                      style={{
                        background: 'rgba(26,35,51,0.6)',
                        border: '1px solid rgba(45,55,72,0.4)',
                        borderRadius: 4,
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="uploaded"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(17,24,39,0.6)',
              border: '1px solid rgba(45,55,72,0.4)',
            }}
          >
            <div className="flex items-start gap-3 p-4">
              <div className="w-20 h-16 rounded-lg overflow-hidden flex-shrink-0"
                   style={{ background: 'rgba(26,35,51,0.8)' }}>
                <img
                  src={uploadedImage.thumbnailUrl}
                  alt="Query"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileImage className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
                    <span className="text-body-s text-text-primary font-medium truncate">
                      {uploadedImage.name}
                    </span>
                  </div>
                  <button onClick={clearImage} className="btn-ghost p-0.5 flex-shrink-0">
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
                  {uploadedImage.resolution && (
                    <div className="text-caption text-text-tertiary font-mono">
                      {uploadedImage.resolution} · {uploadedImage.fileSize}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {uploadedImage.detectedRegion && (
              <div
                className="mx-4 mb-4 px-3 py-2.5 rounded-lg"
                style={{
                  background: 'rgba(59,130,246,0.06)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-3 h-3 text-blue-primary flex-shrink-0" />
                  <span className="text-body-s text-blue-primary font-medium">
                    {uploadedImage.detectedRegion}
                  </span>
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

      <button
        onClick={() => uploadedImage && startSearch()}
        disabled={!uploadedImage || isSearching}
        className="btn-primary w-full disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSearching ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processing…
          </>
        ) : (
          'Begin Intelligence Search'
        )}
      </button>
    </div>
  )
}
