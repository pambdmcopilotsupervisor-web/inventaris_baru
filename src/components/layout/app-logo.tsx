import Image from "next/image"
import { cn } from "@/lib/utils"

interface AppLogoProps {
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function AppLogo({ className, imageClassName, priority = false }: AppLogoProps) {
  return (
    <span className={cn("relative flex shrink-0 overflow-hidden rounded-lg bg-white", className)}>
      <Image
        src="/pedami-logo.png"
        alt="Logo PEDAMI"
        fill
        sizes="48px"
        className={cn("object-cover", imageClassName)}
        priority={priority}
      />
    </span>
  )
}
