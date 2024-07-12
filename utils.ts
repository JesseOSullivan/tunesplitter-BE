import axios from 'axios';
import { YOUTUBE_API_KEY } from './config';




function extractVideoId(url: string): string {
  const urlObj = new URL(url);
  const videoId = urlObj.searchParams.get('v');
  console.log(`Extracted video ID: ${videoId}`);
  return videoId || '';
}

async function fetchComments(videoId: string): Promise<string[]> {
  let comments: string[] = [];
  let nextPageToken = '';
  const maxComments = 3000; // Increase max comments to fetch all
  let commentsFetched = 0;

  console.log(`Fetching comments for video ID: ${videoId}`);
  try {
    do {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/commentThreads', {
        params: {
          part: 'snippet',
          videoId,
          key: YOUTUBE_API_KEY,
          maxResults: 1000,
          pageToken: nextPageToken,
          order: 'relevance',
        },
      });

      if (response.status !== 200) {
        throw new Error(`Unexpected response status: ${response.status}`);
      }

      const commentItems = response.data.items;
      commentItems.forEach(item => {
        const comment = item.snippet.topLevelComment.snippet.textDisplay;
        comments.push(comment);
        commentsFetched++;
        if (commentsFetched >= maxComments) return;
      });

      nextPageToken = response.data.nextPageToken || '';
      console.log(`Fetched ${commentsFetched} comments so far...`);
    } while (nextPageToken && commentsFetched < maxComments);

    console.log('Finished fetching comments.');

    if (comments.length > 5) {
      console.log('Last 5 comments:');
      console.log(comments.slice(-5).join('\n'));
    }

    return comments;
  } catch (error) {
    console.error(`Failed to fetch comments: ${error.message}`);
    console.error(error.response?.data || error.message);
    throw new Error(`Failed to fetch comments: ${error.message}`);
  }
}
