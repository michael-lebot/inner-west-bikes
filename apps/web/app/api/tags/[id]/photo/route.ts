import { attachPhoto } from '@iwb/server'
import { AppError, PHOTO_MAX_BYTES, TagParams } from '@iwb/shared'
import { processPhoto } from '@/lib/image'
import { write } from '@/lib/write'

/** A tag's one photo (§4.3), sent as a form after the tag is added, and only ever stored re-encoded. */
export const POST = write(async ({ request, params, visitor }) => {
  const { id } = TagParams.parse(await params)
  // Refused before the body is read. Vercel refuses a body over 4.5 MB anyway.
  if (Number(request.headers.get('content-length')) > PHOTO_MAX_BYTES) throw new AppError('too_large')
  const photo = (await request.formData().catch(() => null))?.get('photo')
  if (!(photo instanceof File)) throw new AppError('invalid')
  return attachPhoto({ tagId: id, visitor, photo: await processPhoto(photo) })
})
