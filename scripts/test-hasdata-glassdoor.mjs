import fs from "fs";
import path from "path";

// 1. Read API key from env or .env.local
let apiKey = process.env.HASDATA_API_KEY;

if (!apiKey) {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/HASDATA_API_KEY=["']?([^"'\r\n]+)["']?/);
    if (match) apiKey = match[1].trim();
  }
}

// Target URL specified by user
const TARGET_URL =
  process.argv[2] ||
  "https://www.glassdoor.com/job-listing?jl=1010290848642";

async function testHasDataGlassdoor() {
  if (!apiKey) {
    console.error("❌ HASDATA_API_KEY not found!");
    console.error("👉 Please add HASDATA_API_KEY to .env.local or pass via CLI:");
    console.error('   HASDATA_API_KEY="your_key" node scripts/test-hasdata-glassdoor.mjs');
    process.exit(1);
  }

  console.log(`\n================================================================`);
  console.log(` TESTING HASDATA GLASSDOOR JOB SCRAPER API`);
  console.log(` Target : ${TARGET_URL}`);
  console.log(` Endpoint: GET https://api.hasdata.com/scrape/glassdoor/job`);
  console.log(`================================================================\n`);

  const endpoint = new URL("https://api.hasdata.com/scrape/glassdoor/job");
  endpoint.searchParams.set("url", TARGET_URL);

  const start = Date.now();

  try {
    const res = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Accept": "application/json",
      },
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`📡 Status Code : HTTP ${res.status} (${elapsed}s)`);

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error("❌ Non-JSON response received from HasData:");
      console.log(raw.slice(0, 500));
      return;
    }

    if (!res.ok) {
      console.error(`❌ HasData Error (HTTP ${res.status}):`, JSON.stringify(data, null, 2));
      return;
    }

    // HasData returns the job record either at the root or under 'data' / 'job'
    const job = data.data || data.job || data;

    const title = job.title || job.jobTitle || job.role || "N/A";
    const company = job.company || job.companyName || job.employer || "N/A";
    const location = job.location || job.jobLocation || "N/A";
    const salary = job.salary || job.salaryRange || job.compensation || "N/A";
    const postedAt = job.postedAt || job.datePosted || job.postedDate || "N/A";
    const description =
      job.description ||
      job.jobDescription ||
      job.descriptionHtml ||
      job.text ||
      "";

    // 1. Output clean human-readable Markdown to Terminal
    console.log("\n================================================================");
    console.log("✅ PARSED GLASSDOOR JOB SPECIFICATION (HASDATA API)");
    console.log("================================================================\n");

    const markdownDoc = [
      `# ${title}`,
      `**Company:** ${company}`,
      `**Location:** ${location}`,
      `**Salary:** ${salary}`,
      `**Posted:** ${postedAt}`,
      `**Source URL:** [${TARGET_URL}](${TARGET_URL})`,
      `\n---\n`,
      `## Job Description\n`,
      description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    ].join("\n");

    console.log(markdownDoc.slice(0, 1500));
    if (markdownDoc.length > 1500) {
      console.log(`\n... [${(markdownDoc.length - 1500).toLocaleString()} more characters]`);
    }

    // 2. Save both full Markdown and raw JSON artifacts locally for inspection
    const mdPath = path.resolve(process.cwd(), ".glassdoor-hasdata-sample.md");
    const jsonPath = path.resolve(process.cwd(), ".glassdoor-hasdata-sample.json");

    fs.writeFileSync(mdPath, markdownDoc, "utf-8");
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");

    console.log(`\n================================================================`);
    console.log(`💾 Saved clean Markdown to : .glassdoor-hasdata-sample.md`);
    console.log(`💾 Saved raw JSON payload to : .glassdoor-hasdata-sample.json`);
    console.log(`================================================================\n`);
  } catch (err) {
    console.error(`💥 Request failed: ${err.message}`);
  }
}

testHasDataGlassdoor();