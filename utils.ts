/**
 * Converts a standard YouTube URL to an embed URL.
 * Supports formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 */
export const getYouTubeEmbedUrl = (url: string): string => {
  let videoId = '';
  
  if (url.includes('youtube.com/watch?v=')) {
    videoId = url.split('v=')[1].split('&')[0];
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1].split('?')[0];
  } else if (url.includes('youtube.com/embed/')) {
    return url; // Already an embed URL
  }
  
  return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
};
