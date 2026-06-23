import { motion } from 'framer-motion'

export default function FallbackEarth({ message }: { message?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-canvas">
      {/* CSS procedural Earth */}
      <div className="relative mb-8">
        {/* Stars background */}
        <div className="absolute inset-0 -m-20 overflow-hidden rounded-full pointer-events-none">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 rounded-full bg-white/40"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                opacity: 0.2 + Math.random() * 0.6,
              }}
            />
          ))}
        </div>

        {/* Globe */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          className="w-72 h-72 rounded-full relative overflow-hidden"
          style={{
            background: `
              radial-gradient(ellipse at 38% 38%,
                #1e5c8f 0%, #134a7a 20%, #0d3560 45%, #071d3a 75%, #040e20 100%
              )
            `,
            boxShadow: `
              0 0 80px rgba(59,130,246,0.18),
              0 0 160px rgba(59,130,246,0.06),
              inset -24px -24px 64px rgba(0,0,0,0.55)
            `,
          }}
        >
          {/* Land masses — stylized blobs */}
          {[
            { top: '22%', left: '38%', w: '28%', h: '32%', rotate: -15, color: 'rgba(45,100,38,0.7)' },
            { top: '18%', left: '14%', w: '18%', h: '26%', rotate: 8,   color: 'rgba(38,92,32,0.65)' },
            { top: '42%', left: '20%', w: '22%', h: '28%', rotate: -5,  color: 'rgba(42,96,35,0.68)' },
            { top: '28%', left: '68%', w: '24%', h: '20%', rotate: 12,  color: 'rgba(35,88,30,0.60)' },
            { top: '55%', left: '62%', w: '16%', h: '18%', rotate: -8,  color: 'rgba(40,94,34,0.62)' },
            { top: '62%', left: '32%', w: '12%', h: '14%', rotate: 20,  color: 'rgba(36,90,31,0.58)' },
          ].map((blob, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                top: blob.top, left: blob.left,
                width: blob.w, height: blob.h,
                background: blob.color,
                transform: `rotate(${blob.rotate}deg)`,
                filter: 'blur(2px)',
              }}
            />
          ))}

          {/* Polar ice */}
          <div className="absolute top-0 left-0 right-0 h-[12%] rounded-full"
            style={{ background: 'rgba(215,232,245,0.45)', filter: 'blur(3px)' }} />
          <div className="absolute bottom-0 left-0 right-0 h-[10%] rounded-full"
            style={{ background: 'rgba(210,228,242,0.40)', filter: 'blur(3px)' }} />

          {/* Cloud wisps */}
          {[
            { top: '30%', left: '-10%', w: '60%', h: '8%', opacity: 0.15 },
            { top: '50%', left: '20%',  w: '50%', h: '6%', opacity: 0.12 },
            { top: '70%', left: '-5%',  w: '55%', h: '7%', opacity: 0.10 },
          ].map((c, i) => (
            <div key={i} className="absolute rounded-full bg-white"
              style={{ top: c.top, left: c.left, width: c.w, height: c.h,
                opacity: c.opacity, filter: 'blur(4px)' }} />
          ))}
        </motion.div>

        {/* Atmosphere glow */}
        <div className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 35% 35%, transparent 55%, rgba(59,130,246,0.07) 100%)',
            border: '1px solid rgba(59,130,246,0.12)',
            transform: 'scale(1.06)',
          }}
        />

        {/* Orbital ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          className="absolute"
          style={{
            top: '50%', left: '50%',
            width: '130%', height: '130%',
            marginTop: '-65%', marginLeft: '-65%',
            border: '1px solid rgba(20,184,166,0.18)',
            borderRadius: '50%',
            transform: 'rotateX(72deg)',
          }}
        />
      </div>

      {/* Status */}
      <div className="text-center space-y-1.5">
        <div className="font-display text-heading-1 text-text-primary">AKSHA</div>
        <div className="text-body-s text-text-tertiary">
          {message ?? 'Earth visualization initializing...'}
        </div>
      </div>
    </div>
  )
}
