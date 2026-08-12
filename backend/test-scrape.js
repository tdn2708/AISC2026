const axios = require('axios');
const cheerio = require('cheerio');

async function testScrape() {
  try {
    const url = 'https://www.trustpilot.com/review/shopee.vn';
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(data);
    const reviews = [];
    
    $('[data-service-review-text-typography="true"]').each((i, el) => {
      reviews.push($(el).text().trim());
    });
    
    console.log(`Found ${reviews.length} reviews:`);
    console.log(reviews);
  } catch(e) {
    console.error(e.message);
  }
}
testScrape();
