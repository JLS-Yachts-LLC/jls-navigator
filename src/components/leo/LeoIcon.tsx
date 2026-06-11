import leoImg from '@/assets/leo-icon.png'

interface LeoIconProps {
  size?: number
  /** kept for API compatibility — PNG has fixed colours */
  variant?: 'leo' | 'signal'
  className?: string
}

export function LeoIcon({ size = 24, className }: LeoIconProps) {
  return (
    <img
      src={leoImg}
      width={size}
      height={size}
      alt="Leo"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  )
}
