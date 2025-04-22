const path = require("path");
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const puppeteer = require("puppeteer-core");
const chrome = require("@sparticuz/chromium");
const { createObjectCsvWriter } = require("csv-writer");
const { ensureOutputDir, OUTPUT_DIR } = require('./utils');

if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch (e) {
    console.log("Could not load dotenv, using process.env variables");
  }
}

const API_KEY = process.env.API_KEY;

function getApiKey() {
  if (!API_KEY) {
    console.error("API_KEY environment variable is not set");
    return {
      error:
        "API key not configured. Please set the API_KEY environment variable.",
    };
  }
  return { api_key: API_KEY };
}

// Write data to CSV
async function writeCsv(data, filename) {
  ensureOutputDir();
  const filepath = path.join(OUTPUT_DIR, filename);

  try {
    const header = Object.keys(data[0]).map((key) => ({ id: key, title: key }));
    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header,
    });

    await csvWriter.writeRecords(data);
    console.log(`✅ Data saved to ${filepath}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to write CSV:", error.message);
    return false;
  }
}

// Extract date from LinkedIn posting relative time
function extractPostDate(relativeTime) {
  const now = new Date();
  let postedDate = new Date(now);
  
  if (!relativeTime) return postedDate.toISOString().split('T')[0]; // Default to today
  
  if (relativeTime.includes('minute') || relativeTime.includes('hour')) {
    // Posted today
    return postedDate.toISOString().split('T')[0];
  } else if (relativeTime.includes('day')) {
    const days = parseInt(relativeTime.match(/\d+/) || 1);
    postedDate.setDate(postedDate.getDate() - days);
  } else if (relativeTime.includes('week')) {
    const weeks = parseInt(relativeTime.match(/\d+/) || 1);
    postedDate.setDate(postedDate.getDate() - (weeks * 7));
  } else if (relativeTime.includes('month')) {
    const months = parseInt(relativeTime.match(/\d+/) || 1);
    postedDate.setMonth(postedDate.getMonth() - months);
  } else if (relativeTime.includes('year')) {
    const years = parseInt(relativeTime.match(/\d+/) || 1);
    postedDate.setFullYear(postedDate.getFullYear() - years);
  }
  
  return postedDate.toISOString().split('T')[0];
}

// Main scraping function
async function scrapeLinkedInJobs(options) {
  let browser;
  try {
    console.log("🚀 Starting LinkedIn scraper...");

    // Launch browser with more resilient options
    if (
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production"
    ) {
      browser = await puppeteer.launch({
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-features=site-per-process",
          "--disable-gpu",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
        ],
        executablePath: await chrome.executablePath(),
        headless: chrome.headless,
        ignoreHTTPSErrors: true,
      });
    } else {
      browser = await puppeteer.launch({
        channel: "chrome",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-features=site-per-process",
        ],
        headless: chrome.headless,
        ignoreHTTPSErrors: true,
      });
    }

    // Create page with proper error handling
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    page.setDefaultNavigationTimeout(80000);

    // Enable request interception to handle blocking
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      // Block unnecessary resources to speed up loading
      const resourceType = request.resourceType();
      if (
        resourceType === "image" ||
        resourceType === "font" ||
        resourceType === "media"
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    const jobs = [];
    const maxPages = Math.ceil(Math.min(options.jobCount, 100) / 10);
    let consecutiveErrors = 0;

    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      if (consecutiveErrors >= 3) {
        console.log("⚠️ Too many consecutive errors, stopping...");
        break;
      }

      const start = pageNum * 10;
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
        options.keyword
      )}&location=${encodeURIComponent(options.location)}&start=${start}`;

      console.log(`🌐 Fetching page ${pageNum + 1}...`);

      try {
        // Check browser connection before each navigation
        if (!browser.isConnected()) {
          throw new Error("Browser disconnected unexpectedly");
        }

        // Use a simpler loading strategy
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        // Add a small delay for stability
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get page content
        const content = await page.content();

        // Check for blocking
        if (
          content.includes("authwall") ||
          content.includes("security check") ||
          content.includes("captcha")
        ) {
          throw new Error(
            "LinkedIn is blocking requests. Try again later or use different IP."
          );
        }

        // Extract job listings
        const jobCards = await page.$$("li");
        console.log(
          `📄 Found ${jobCards.length} job cards on page ${pageNum + 1}`
        );

        if (jobCards.length === 0) {
          consecutiveErrors++;
          console.log(
            `⚠️ No job cards found on page ${
              pageNum + 1
            }, might be end of results`
          );

          // If first page has no results, it's likely an error
          if (pageNum === 0) {
            throw new Error("No job listings found for this search");
          }

          // Otherwise it might just be end of results
          continue;
        } else {
          consecutiveErrors = 0; // Reset counter on success
        }

        for (const card of jobCards) {
          try {
            // Verify browser is still connected before each card processing
            if (!browser.isConnected()) {
              throw new Error("Browser disconnected during card processing");
            }

            const title = await card.$eval("h3", (el) => el.textContent.trim());
            const company = await card.$eval("h4", (el) =>
              el.textContent.trim()
            );
            const location = await card.$eval(
              ".job-search-card__location",
              (el) => el.textContent.trim()
            );
            const link = await card.$eval("a", (el) => el.href);
            
            // Get the job posted date
            let postedDate = "Not available";
            try {
              // Try multiple selectors for the date element
              const dateSelectors = [
                ".job-search-card__listdate",
                "time",
                ".job-posted-time",
                ".job-search-card__time-ago"
              ];
              
              for (const selector of dateSelectors) {
                const dateElement = await card.$(selector);
                if (dateElement) {
                  const relativeTime = await dateElement.evaluate(el => el.textContent.trim());
                  if (relativeTime && relativeTime.length > 0) {
                    postedDate = extractPostDate(relativeTime);
                    console.log(`Found posted date: ${postedDate} from selector: ${selector}`);
                    break;
                  }
                }
              }
              
              // If date still not available, try to get it from data attributes
              if (postedDate === "Not available") {
                const dateAttribute = await card.evaluate(el => {
                  const timeElement = el.querySelector('time');
                  if (timeElement) {
                    return timeElement.getAttribute('datetime');
                  }
                  return null;
                });
                
                if (dateAttribute) {
                  try {
                    const date = new Date(dateAttribute);
                    if (!isNaN(date.getTime())) {
                      postedDate = date.toISOString().split('T')[0];
                      console.log(`Found posted date from attribute: ${postedDate}`);
                    }
                  } catch (dateParseError) {
                    console.log(`Error parsing date attribute: ${dateParseError.message}`);
                  }
                }
              }
            } catch (dateError) {
              console.log("Could not extract posting date:", dateError.message);
            }

            jobs.push({
              title,
              company,
              location,
              link,
              postedDate,
              applicationsCount: "Not available", // Will be updated for some jobs below
              date: new Date().toISOString(), // Keep the original date field for compatibility
            });
          } catch (cardError) {
            console.log("⚠️ Error processing job card:", cardError.message);
            // Continue with next card
          }
        }
        
        // Get detailed information for the first few jobs
        // This is done separately to avoid navigation issues during the main listing scrape
        if (pageNum === 0 && jobs.length > 0) {
          console.log("📊 Getting detailed information for some jobs...");
          
          // Only process the first 5 jobs to avoid rate limiting
          const jobsToProcess = Math.min(5, jobs.length);
          
          for (let i = 0; i < jobsToProcess; i++) {
            try {
              const job = jobs[i];
              console.log(`🔍 Visiting job details for: ${job.title}`);
              
              // Visit the job detail page
              await page.goto(job.link, { 
                waitUntil: "domcontentloaded", 
                timeout: 30000 
              });
              
              // Wait a bit for page to stabilize
              await new Promise((resolve) => setTimeout(resolve, 1500));
              
              // Try to extract applications count
              try {
                const applicationsText = await page.evaluate(() => {
                  // Expanded list of selectors to find application counts
                  const selectors = [
                    '.num-applicants',
                    '.jobs-unified-top-card__applicant-count',
                    '.jobs-details-top-card__applicant-count',
                    '.jobs-top-card__content-container .jobs-top-card__bullet',
                    '.jobs-unified-top-card__subtitle-primary-grouping .jobs-unified-top-card__bullet',
                    '.job-details-jobs-unified-top-card__primary-description-container .job-details-jobs-unified-top-card__bullet-item',
                    '.job-view-layout .jobs-unified-top-card__subtitle-primary-grouping span',
                    '.job-view-layout .job-details-jobs-unified-top-card__primary-description-container',
                    '.jobs-unified-top-card__subtitle'
                  ];
                  
                  // First try the specific selectors
                  for (const selector of selectors) {
                    const elems = document.querySelectorAll(selector);
                    for (const elem of elems) {
                      if (elem && elem.textContent) {
                        const text = elem.textContent.trim();
                        // Look for patterns like "10 applicants", "10+ applicants", "Be among the first 10 applicants"
                        if (text.includes('applicant') || text.includes('application')) {
                          return text.trim();
                        }
                      }
                    }
                  }
                  
                  // Try a more generic approach - look for any element with text containing "applicant"
                  const allElements = document.querySelectorAll('div, span, p, li');
                  for (const elem of allElements) {
                    if (elem && elem.textContent) {
                      const text = elem.textContent.trim();
                      if ((text.includes('applicant') || text.includes('application')) && 
                          (text.includes('Be among') || /\d+/.test(text))) {
                        return text.trim();
                      }
                    }
                  }
                  
                  return null;
                });
                
                if (applicationsText) {
                  console.log(`Found application text: "${applicationsText}"`);
                  
                  // Extract number from various formats
                  let match;
                  
                  // Pattern: "XX applicants" or "XX+ applicants"
                  match = applicationsText.match(/(\d+)\+?\s*applicants?/i);
                  
                  // Pattern: "Be among the first XX applicants"
                  if (!match) {
                    match = applicationsText.match(/first\s*(\d+)\s*applicants?/i);
                  }
                  
                  // Pattern: "XX applications"
                  if (!match) {
                    match = applicationsText.match(/(\d+)\s*applications?/i);
                  }
                  
                  // Pattern: just extract any number if it contains "applicant"
                  if (!match && applicationsText.includes('applicant')) {
                    match = applicationsText.match(/(\d+)/);
                  }
                  
                  if (match) {
                    jobs[i].applicationsCount = match[1];
                    console.log(`📈 Found ${match[1]} applicants`);
                  } else if (applicationsText.includes('Be among the first')) {
                    jobs[i].applicationsCount = 'Under 5'; // LinkedIn often uses this for very few applicants
                    console.log(`📈 Found "Be among the first" (few applicants)`);
                  } else {
                    jobs[i].applicationsCount = 'Not available';
                  }
                }
              } catch (appCountError) {
                console.log("Could not extract applications count:", appCountError.message);
              }
              
              // Try to get a more accurate posted date from job details page
              try {
                const detailDateText = await page.evaluate(() => {
                  const selectors = [
                    '.jobs-unified-top-card__posted-date',
                    '.jobs-posted-date',
                    '.jobs-details-top-card__posted-date',
                    '.jobs-top-card__content-container .jobs-top-card__bullet',
                    'time[datetime]',
                    '.job-view-layout .jobs-details__main-content .mt2'
                  ];
                  
                  // First try to find datetime attribute on time element
                  const timeElement = document.querySelector('time[datetime]');
                  if (timeElement) {
                    const dateAttr = timeElement.getAttribute('datetime');
                    if (dateAttr) return `datetime:${dateAttr}`;
                  }
                  
                  // Then try text-based selectors
                  for (const selector of selectors) {
                    const elem = document.querySelector(selector);
                    if (elem && (elem.textContent.includes('ago') || 
                                elem.textContent.includes('day') || 
                                elem.textContent.includes('week') || 
                                elem.textContent.includes('month') ||
                                elem.textContent.includes('hour') ||
                                elem.textContent.includes('minute'))) {
                      return elem.textContent.trim();
                    }
                  }
                  
                  // Try to find any element that mentions posting date
                  const allElements = document.querySelectorAll('div, span, p');
                  for (const elem of allElements) {
                    const text = elem.textContent;
                    if (text && text.includes('Posted')) {
                      return text.trim();
                    }
                  }
                  
                  return null;
                });
                
                if (detailDateText) {
                  // Check if we got a datetime attribute value
                  if (detailDateText.startsWith('datetime:')) {
                    try {
                      const dateStr = detailDateText.substring(9);
                      const date = new Date(dateStr);
                      if (!isNaN(date.getTime())) {
                        jobs[i].postedDate = date.toISOString().split('T')[0];
                        console.log(`📅 Found posting date from attribute: ${jobs[i].postedDate}`);
                      }
                    } catch (dateParseError) {
                      console.log(`Error parsing datetime attribute: ${dateParseError.message}`);
                    }
                  } else {
                    // Process text-based date
                    const betterDate = extractPostDate(detailDateText);
                    if (betterDate !== "Not available") {
                      jobs[i].postedDate = betterDate;
                      console.log(`📅 Found posting date: ${betterDate}`);
                    }
                  }
                }
              } catch (detailDateError) {
                console.log("Could not extract detailed date:", detailDateError.message);
              }
            } catch (detailError) {
              console.log(`⚠️ Error visiting job details: ${detailError.message}`);
            }
          }
          
          // Return to search results for next page
          await page.goto(url, { 
            waitUntil: "domcontentloaded", 
            timeout: 60000 
          });
          
          // Add a small delay for stability
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (pageError) {
        consecutiveErrors++;
        console.log(`⚠️ Error on page ${pageNum + 1}:`, pageError.message);

        // For first page, return the error
        if (pageNum === 0) {
          return { error: pageError.message };
        }

        // Otherwise pause briefly and continue
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    if (jobs.length === 0) {
      return { error: "No jobs found. Check your search parameters." };
    }

    console.log(`✅ Scraping complete. Found ${jobs.length} jobs.`);
    
    // Write to CSV and return results
    const filename = `jobs_${options.keyword
      .toLowerCase()
      .replace(/\s+/g, '_')}_${Date.now()}.csv`;
    
    await writeCsv(jobs, filename);
    
    return { jobs, filename };
  } catch (error) {
    console.error("❌ Fatal scraping error:", error);
    return { error: `Scraping failed: ${error.message}` };
  } finally {
    // Ensure browser is properly closed
    if (browser) {
      try {
        console.log("🔄 Closing browser...");
        await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError.message);
      }
    }
  }
}

module.exports = {
  scrapeLinkedInJobs,
  writeCsv
}; 