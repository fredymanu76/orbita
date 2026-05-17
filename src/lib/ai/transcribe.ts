import { getOpenAIClient } from './openai'

export async function transcribeAudio(audioFile: File): Promise<string | null> {
  try {
    const openai = getOpenAIClient()

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'text',
    })

    return transcription as unknown as string
  } catch (error) {
    console.error('Transcription error:', error)
    return null
  }
}
