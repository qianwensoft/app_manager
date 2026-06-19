import { toast } from "@/components/ui/use-toast"

/**
 * antd message API 兼容层
 * 将 antd 的 message.xxx() 调用转换为 shadcn/ui toast
 */
export const message = {
  success: (content: string, duration: number = 3) => {
    toast({
      title: content,
      duration: duration * 1000,
    })
  },

  error: (content: string, duration: number = 3) => {
    toast({
      title: content,
      variant: "destructive",
      duration: duration * 1000,
    })
  },

  warning: (content: string, duration: number = 3) => {
    toast({
      title: content,
      description: "请注意",
      duration: duration * 1000,
    })
  },

  info: (content: string, duration: number = 3) => {
    toast({
      title: content,
      duration: duration * 1000,
    })
  },

  loading: (content: string) => {
    return toast({
      title: content,
      duration: Infinity,
    })
  },
}
