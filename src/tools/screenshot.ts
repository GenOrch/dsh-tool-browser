/**
 * The model-facing `browser_screenshot` tool: capture the page as a PNG image.
 *
 * The screenshot is committed through the mounted attachment store
 * (`ctx.attachments`), so the returned image block references a durable,
 * content-addressed object — the same route `read_image` uses.
 * @module @deepseek-ai/dsh-tool-browser/src/tools/screenshot
 */

import type { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_SESSION, type BrowserEngine } from '../engine.ts'

/** The structured outcome declared by the `browser_screenshot` output schema. */
interface ScreenshotValue {
  width: number
  height: number
  bytes: number
  image: {
    attachmentId: string
    mediaType: 'image/png'
    bytes: number
    width: number
    height: number
  }
}

/** Re-brand the structured image outcome into the durable attachment reference an `ImageBlock` carries. */
function imageRef(value: ScreenshotValue['image']): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(value.attachmentId),
    mediaType: value.mediaType,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
  }
}

/** Register `browser_screenshot`. */
export function applyScreenshotTool(ctx: Context, engine: BrowserEngine): void {
  ctx.tools.register(defineTool({
    name: 'browser_screenshot',
    description: 'Capture the current browser page as a PNG image and return the image itself. Use it to verify the page state after navigation or interaction.',
    parameters: {
      sessionId: { type: 'string', description: 'Browser session to capture. Omit for the default session.' },
      fullPage: { type: 'boolean', description: 'Capture the entire scrollable page instead of just the viewport. Default false.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          bytes: { type: 'integer', required: true },
          image: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              attachmentId: { type: 'string', required: true },
              mediaType: { type: 'string', enum: ['image/png'], required: true },
              bytes: { type: 'integer', required: true },
              width: { type: 'integer', required: true },
              height: { type: 'integer', required: true },
            },
          },
        },
      },
      render: (_args, value) => [
        { type: 'text', text: `Screenshot ${value.width}x${value.height} px, ${value.bytes} bytes` },
        { type: 'image', attachment: imageRef(value.image) },
      ],
    },
    async execute(args, exec) {
      const fullPage = args.fullPage ?? false
      const buf = await engine.screenshot(args.sessionId ?? DEFAULT_SESSION, exec.signal, fullPage)
      const attachments = ctx.get('attachments')
      if (attachments === undefined) {
        throw new Error('browser_screenshot requires a mounted attachment store (ctx.attachments) to durably commit the image')
      }
      const ref = await attachments.saveImage({ data: new Uint8Array(buf), mediaType: 'image/png' })
      const result: ScreenshotValue = {
        width: ref.width,
        height: ref.height,
        bytes: ref.bytes,
        image: {
          attachmentId: ref.attachmentId,
          mediaType: 'image/png',
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
        },
      }
      return result
    },
    presentCall(): { card: 'generic'; title: string; kind: 'other' } {
      return { card: 'generic', title: 'Take screenshot', kind: 'other' }
    },
  }))
}
