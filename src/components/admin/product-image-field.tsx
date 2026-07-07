'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface ProductImageFieldProps {
  /** Current public image URL, or null. */
  value: string | null
  onChange: (url: string | null) => void
  /** Storage folder inside the product-images bucket ('products' | 'awning-products'). */
  folder: string
}

/**
 * Product photo upload (WS3 §8.1). Uploads to the public `product-images`
 * storage bucket (admin-only write via storage RLS) and hands back the
 * public URL to store on the product row.
 */
export function ProductImageField({ value, onChange, folder }: ProductImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB')
      return
    }
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })
    if (error) {
      toast.error(error.message)
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    onChange(data.publicUrl)
    setUploading(false)
    toast.success('Image uploaded')
  }

  return (
    <div className="space-y-2">
      <Label>Product Photo</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
      {value ? (
        <div className="flex items-center gap-3">
          <Image
            src={value}
            alt="Product photo"
            width={96}
            height={72}
            className="h-18 w-24 rounded-md border object-cover"
            unoptimized
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(null)}>
              <Trash2 className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="mr-2 h-4 w-4" />
          {uploading ? 'Uploading…' : 'Upload Image'}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Shown in the Style Gallery and configurator. JPG/PNG, up to 5MB.</p>
    </div>
  )
}
