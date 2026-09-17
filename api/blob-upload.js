import { handleUpload } from '@vercel/blob/client';

export default async function handler(request, response) {
  try {
    const body = await request.json();
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/jpeg','image/png','image/webp'],
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ scope: 'product-image' })
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('Blob uploaded:', blob.url);
      }
    });
    return response.status(200).json(jsonResponse);
  } catch (error) {
    console.error(error);
    return response.status(400).json({ error: error.message });
  }
}
