/**
 * Hermetic Glassdoor-shaped HTML that previously produced orphaned `**` / stray `###`
 * when heading/bold coalescing was broken (Skyeton-style section labels).
 */
export const GLASSDOOR_HEADING_FIXTURE_HTML = `
<html><body>
  <div id="JobDescriptionContainer">
    <div><strong>Company Culture</strong></div>
    <p>We build resilient systems for operators in the field.</p>
    <div><strong>About the role</strong></div>
    <p>You will design backend services and partner with product weekly.</p>
    <h3>Responsibilities</h3>
    <ul>
      <li>Ship reliable APIs</li>
      <li>Improve observability</li>
    </ul>
  </div>
</body></html>
`.trim();
