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

            jobs.push({
              title,
              company,
              location,
              link,
              date: new Date().toISOString(),
            });
          } catch (cardError) {
            console.log("⚠️ Error processing job card:", cardError.message);
            // Continue with next card
          }
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