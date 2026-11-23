import type { ExtractedJobContext } from "../lib/types";

/**
 * Fallback standalone extractor injected directly via chrome.scripting.executeScript.
 * Must remain completely self-contained with zero external closure dependencies.
 */
          export function injectedExtractionScript() {
            const doc = document;
            const href = window.location.href;

            function clean(str: string | null | undefined): string {
              if (!str) return "";
              return str
                .replace(/<[^>]*>/g, " ")
                .replace(/&nbsp;/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/[ \t]+/g, " ")
                .replace(/\n\s*\n\s*\n/g, "\n\n")
                .trim();
            }

            function htmlToMd(htmlStr: string | null | undefined): string {
              if (!htmlStr) return "";
              let s = htmlStr;
              s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
              s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
              s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, level, content) => {
                const hashes = "#".repeat(Math.min(Number(level), 3));
                const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                return text ? `\n\n${hashes} ${text}\n\n` : "\n\n";
              });
              s = s.replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, (m, inner) => {
                const trimmed = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                return trimmed ? `**${trimmed}**` : "";
              });
              s = s.replace(/<(?:i|em)[^>]*>([\s\S]*?)<\/(?:i|em)>/gi, (m, inner) => {
                const trimmed = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                return trimmed ? `*${trimmed}*` : "";
              });
              s = s.replace(/<li[^>]*>/gi, "\n- ");
              s = s.replace(/<\/li>/gi, "");
              s = s.replace(/<br\s*\/?>/gi, "\n");
              s = s.replace(/<\/?(?:p|div|section|article|blockquote|ul|ol)[^>]*>/gi, "\n\n");
              s = s.replace(/<[^>]+>/g, " ");
              s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&bull;/g, "•");
              s = s.replace(/[ \t]+/g, " ");
              s = s.replace(/[ \t]*\n[ \t]*/g, "\n");
              return s.replace(/\n{3,}/g, "\n\n").trim();
            }

            function stripChrome(text: string): string {
              let s = text;
              // Strip platform applicant stats & preamble
              const aboutJobIdx = s.search(/(?:^|[\n\r]|(?<=[a-z]))About the (?:job|role|position)/i);
              if (aboutJobIdx > 30) {
                const preamble = s.slice(0, aboutJobIdx);
                if (/reposted|applicants|easy apply|match details|people you can reach out to|sign in|applied ai/i.test(preamble)) {
                  s = s.slice(aboutJobIdx).trim();
                }
              }
              // Strip trailing aggregator recommendations, footer, and language lists
              const postamblePatterns = [
                /(?:\b|(?<=[a-z]))(?:Benefits found in job post|Set alert for similar jobs|Job search (?:faster|smarter) with Premium|Looking for talent\?|Start hiring|More jobs|Similar jobs|Jobs you may like|See more jobs like this|About Accessibility|LinkedIn Corporation ©|Questions\? Visit our Help Center|Recommendation transparency|Select language)[\s\S]*$/i,
                /\b(?:About the company\s*[\s\S]*?)?(?:More jobs|Similar jobs|Looking for talent\?)[\s\S]*$/i,
              ];
              for (const rx of postamblePatterns) {
                s = s.replace(rx, "").trim();
              }
              return s.replace(/[….]\s*more\s*$/i, "").trim();
            }

            const isIndeed =
              href.includes("indeed.com") ||
              doc.title.includes("Indeed") ||
              doc.querySelector(
                "[data-testid='vj-job-title'], [data-testid='jobDetailTitle'], #jobsearch-ViewjobPaneWrapper, [data-testid='jobsearch-CompanyAvatarImage']"
              ) !== null;

            if (isIndeed) {
              const pane = doc.querySelector("#jobsearch-ViewjobPaneWrapper") || doc;
              let title = "";
              const titleEl = pane.querySelector(
                "[data-testid='vj-job-title'], [data-testid='jobDetailTitle'] h3, [data-testid='jobDetailTitle'], [data-testid='jobsearch-JobInfoHeader-title'], .jobsearch-JobInfoHeader-title"
              );
              if (titleEl) {
                const t = clean(titleEl.textContent);
                if (t && !/\$|\/Hr|\/yr|\b(?:an?\s*hour|a\s*year|full-time|part-time)\b/i.test(t)) {
                  title = t;
                }
              }
              if (!title && doc.title) {
                const cleaned = doc.title
                  .replace(/\s*-\s*[A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?\s*-\s*Indeed\.com$/i, "")
                  .replace(/\s*\|\s*Indeed\.com$/i, "")
                  .replace(/\s*-\s*Indeed\.com$/i, "")
                  .trim();
                if (cleaned && !/jobs?|search/i.test(cleaned) && !/\$|\/Hr|\/yr/i.test(cleaned)) {
                  title = cleaned;
                }
              }

              let company = "";
              let location = "";
              const cmpSub =
                pane.querySelector("[data-testid='jobDetailSubtitle']") ||
                doc.querySelector("[data-testid='jobDetailSubtitle']");
              if (cmpSub?.textContent) {
                const subParts = clean(cmpSub.textContent).split(/\s*-\s*/);
                if (subParts.length >= 2) {
                  company = subParts[0].trim();
                  location = subParts.slice(1).join(" - ").trim();
                } else {
                  company = clean(cmpSub.textContent);
                }
              }

              if (!company) {
                const cmpLink = (pane.querySelector("a[href*='/cmp/'][aria-label], a[href*='/cmp/']") ||
                  doc.querySelector("a[href*='/cmp/'][aria-label], a[href*='/cmp/']")) as HTMLAnchorElement | null;
                if (cmpLink) {
                  const rawLabel = cmpLink.getAttribute("aria-label")?.replace(/\s*\(opens in a new tab\)/i, "").trim() || clean(cmpLink.textContent);
                  if (rawLabel && !/^(snapshot|reviews|salaries|jobs)$/i.test(rawLabel)) {
                    company = rawLabel;
                  }
                }
              }

              if (!company) {
                const coEl = pane.querySelector(
                  "[data-testid='inlineHeader-companyName'], [data-testid='company-info-metadata'] a"
                );
                if (coEl) {
                  const t = clean(coEl.textContent);
                  if (t && !/^(snapshot|reviews|salaries|jobs)$/i.test(t)) company = t;
                }
              }

              if (!company) {
                const scripts = Array.from(doc.querySelectorAll("script")).filter((s) =>
                  /application\/ld\+json/i.test(s.getAttribute("type") || "")
                );
                for (const s of scripts) {
                  try {
                    const parsed = JSON.parse(s.textContent || "");
                    const items = Array.isArray(parsed) ? parsed : [parsed];
                    for (const it of items) {
                      if (
                        (it["@type"] === "LocalBusiness" || it["@type"] === "Organization") &&
                        typeof it.name === "string"
                      ) {
                        company = it.name.trim();
                        break;
                      }
                    }
                  } catch {}
                  if (company) break;
                }
              }

              if (!company && doc.title) {
                const m = doc.title.match(/^([A-Za-z0-9&.,' -]+?)\s+Jobs\s+in\s+/i);
                if (m) company = m[1].trim();
              }

              if (!location) {
                const cmpMeta = pane.querySelector("[data-testid='company-info-metadata']");
                if (cmpMeta) {
                  const leafEls = Array.from(cmpMeta.querySelectorAll("div, span")).filter(
                    (el) => el.children.length === 0 && !el.closest("a")
                  );
                  for (const el of leafEls) {
                    const txt = clean(el.textContent);
                    if (!txt || txt === "·" || txt === "•" || /^\d+\.\d+$/.test(txt)) continue;
                    if (company && (txt.toLowerCase() === company.toLowerCase() || txt.includes(company))) continue;
                    if (/[A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5})?/.test(txt) || /^(?:Remote|Hybrid|[A-Z][a-z]+)$/i.test(txt)) {
                      location = txt;
                      break;
                    }
                  }
                }
              }

              if (!location) {
                const locEl = pane.querySelector(
                  "[data-testid='inlineHeader-companyLocation'], [data-testid='jobsearch-JobInfoHeader-companyLocation']"
                );
                if (locEl) {
                  const locTxt = clean(locEl.textContent);
                  if (locTxt && locTxt !== "·" && locTxt !== company) location = locTxt;
                }
              }

              if (!location && doc.title) {
                const titleWithoutIndeed = doc.title.replace(/\s*-\s*Indeed\.com$/i, "").trim();
                const parts = titleWithoutIndeed.split(/\s*-\s*/);
                const lastPart = parts[parts.length - 1]?.trim();
                if (lastPart && lastPart !== title && !/jobs?|search/i.test(lastPart)) {
                  location = lastPart;
                }
              }

              if (location && company && (location.toLowerCase() === company.toLowerCase() || location === company)) {
                location = "";
              }

              let salary = "";
              if (cmpSub) {
                const span = cmpSub.parentElement?.querySelector(
                  "span:not([data-testid='jobDetailSubtitle'])"
                );
                if (span?.textContent && /\$/.test(span.textContent)) {
                  salary = clean(span.textContent);
                }
              }
              if (!salary) {
                const salEl = pane.querySelector(
                  "[data-testid='jobsearch-JobInfoHeader-salary'], span.css-1o18umh, #salaryInfoAndJobType"
                );
                if (salEl && /\$/.test(salEl.textContent || "")) salary = clean(salEl.textContent);
              }
              if (!salary) {
                const leafNodes = Array.from(pane.querySelectorAll("div, span")).filter(
                  (el) => el.children.length === 0 && /\$\d+/.test(el.textContent || "")
                );
                for (const el of leafNodes) {
                  const txt = clean(el.textContent);
                  if (/\$\d+/.test(txt) && /\b(?:an?\s*(?:hour|yr|year|month)|hr|from\s*\$|to\s*\$|a\s*year)\b/i.test(txt)) {
                    salary = txt;
                    break;
                  }
                }
              }

              let logoUrl: string | undefined;
              const jsonScripts = Array.from(doc.querySelectorAll("script")).filter((s) =>
                /application\/ld\+json/i.test(s.getAttribute("type") || "")
              );
              for (const s of jsonScripts) {
                try {
                  const parsed = JSON.parse(s.textContent || "");
                  const items = Array.isArray(parsed) ? parsed : [parsed];
                  for (const it of items) {
                    if (
                      (it["@type"] === "LocalBusiness" || it["@type"] === "Organization") &&
                      typeof it.image === "string"
                    ) {
                      logoUrl = it.image.trim();
                      break;
                    }
                  }
                } catch {}
                if (logoUrl) break;
              }

              if (!logoUrl) {
                const logoEl = pane.querySelector(
                  "[data-testid='company-logo'], [data-testid='company-logo-shadow'], [data-testid='jobsearch-CompanyAvatarImage']"
                );
                if (logoEl) {
                  const bgMatch = (logoEl.getAttribute("style") || "").match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i);
                  if (bgMatch) {
                    logoUrl = bgMatch[1].trim();
                  } else {
                    const innerImg = logoEl.querySelector("img") || (logoEl.tagName === "IMG" ? (logoEl as HTMLImageElement) : null);
                    if (innerImg?.src) logoUrl = innerImg.src;
                  }
                }
              }

              if (!logoUrl) {
                const img = pane.querySelector(
                  "img[src*='cloudfront.net/s/_squarelogo/'], img[src*='images.indeed.com/']"
                ) as HTMLImageElement | null;
                if (img) logoUrl = img.src || img.getAttribute("src") || undefined;
              }

              const descEl =
                pane.querySelector(".simple-job-description-html, [class*='simple-job-description'], [data-testid='jobDetailDescription'], #jobDescriptionText, [data-testid='jobsearch-jobDescriptionText']") ||
                doc.querySelector(".simple-job-description-html, [class*='simple-job-description'], [data-testid='jobDetailDescription'], #jobDescriptionText");
              const description = descEl ? clean(descEl.textContent) : "";

              let finalUrl = href;
              const jkMatch = href.match(/[?&](?:vjk|jk)=([a-zA-Z0-9_-]+)/i);
              if (jkMatch) {
                finalUrl = `https://www.indeed.com/viewjob?jk=${jkMatch[1]}`;
              } else {
                const canonical = doc.querySelector("link[rel='canonical']")?.getAttribute("href");
                if (canonical && /indeed\.com/i.test(canonical)) finalUrl = canonical.trim();
              }

              return {
                title: title || "Job Opportunity",
                company: company || "Company",
                location,
                salary,
                logoUrl,
                url: finalUrl,
                description,
                source: "Indeed",
                extractedAt: new Date().toISOString(),
              };
            }

            interface ExtractedJsonLdJob {
              title?: string;
              company?: string;
              rawDescription?: string;
              description?: string;
              location?: string;
              salary?: string;
              logoUrl?: string;
            }

            interface RawJsonLdNode {
              "@type"?: string;
              title?: string;
              description?: string;
              hiringOrganization?: { name?: string };
              jobLocation?: {
                name?: string;
                address?: {
                  addressLocality?: string;
                  addressRegion?: string;
                };
              };
              baseSalary?: {
                value?: {
                  minValue?: number | string;
                  maxValue?: number | string;
                };
              };
              "@graph"?: RawJsonLdNode[];
            }

            let jsonLdResult: ExtractedJsonLdJob | null = null;
            const scripts = Array.from(doc.querySelectorAll("script")).filter((s) =>
              /application\/ld\+json/i.test(s.getAttribute("type") || "")
            );
            for (const s of scripts) {
              try {
                const parsed = JSON.parse(s.textContent || "{}") as unknown;
                const items: RawJsonLdNode[] = Array.isArray(parsed)
                  ? (parsed as RawJsonLdNode[])
                  : [parsed as RawJsonLdNode];
                for (const it of items) {
                  const target =
                    it["@type"] === "JobPosting"
                      ? it
                      : it["@graph"]?.find((g) => g["@type"] === "JobPosting");
                  if (target) {
                    jsonLdResult = {
                      title: clean(target.title),
                      company: clean(target.hiringOrganization?.name),
                      rawDescription: typeof target.description === "string" ? target.description : "",
                      description: stripChrome(htmlToMd(target.description) || clean(target.description)),
                      location: (() => {
                        const addr = target.jobLocation?.address;
                        if (addr?.addressLocality && addr?.addressRegion) {
                          return `${clean(addr.addressLocality)}, ${clean(addr.addressRegion)}`;
                        }
                        return clean(addr?.addressLocality || addr?.addressRegion || target.jobLocation?.name);
                      })(),
                      salary: target.baseSalary?.value?.minValue
                        ? `$${Math.round(Number(target.baseSalary.value.minValue) * 100) / 100} - $${Math.round(Number(target.baseSalary.value.maxValue) * 100) / 100}`
                        : undefined,
                    };
                    break;
                  }
                }
              } catch {}
            }

            function q(selectors: string[]): string {
              for (const sel of selectors) {
                try {
                  const el = doc.querySelector(sel);
                  if (el) {
                    let text = clean(el.textContent);
                    if (!text) {
                      text = clean(el.getAttribute("aria-label") || el.getAttribute("title"));
                    }
                    if (text) {
                      text = text.replace(/^Company,\s*/i, "").replace(/\.\s*$/, "").trim();
                    }
                    if (text && text.length > 2) return text;
                  }
                } catch {}
              }
              return "";
            }

            const domTitle = q([
              "[id^='jd-job-title-']",
              "[data-test='job-details-header'] h1",
              "[class*='JobDetails_jobDetailsHeader'] h1",
              "[data-testid='jobTitle']",
              "#BigJobCardId h1",
              "#job-view-header h2",
              "h2.job-title",
              ".job-title",
              "[data-testid='job-preview-card'] .job-preview__heading",
              "h5.job-preview__heading",
              "[data-active='true'] [data-testid='search-job-card-link']",
              "[data-testid='job-preview-title']",
              "h1.job-preview__heading",
              "[data-testid='serp-job-details-title']",
              ".application-form-header--title",
              "[data-testid='job-title']",
              ".job-details-jobs-unified-top-card__job-title",
              ".jobs-unified-top-card__job-title",
              "[data-testid='vj-job-title']",
              "[data-testid='jobDetailTitle'] h3",
              "[data-testid='jobDetailTitle']",
              ".jobsearch-JobInfoHeader-title",
              "[data-test='job-title']",
              ".posting-headline h2",
              ".app-title",
              "[data-automation-id='jobPostingHeader']",
              "h1",
            ]);

            function qAll(selectors: string[]): Element[] {
              const res: Element[] = [];
              for (const sel of selectors) {
                try {
                  const els = Array.from(doc.querySelectorAll(sel));
                  res.push(...els);
                } catch {}
              }
              return res;
            }

            const domCompany = q([
              "[data-sdui-screen*='JobDetails'] [aria-label^='Company, ' i]",
              "[aria-label^='Company, ' i]",
              "[data-sdui-screen*='JobDetails'] a[href*='/company/']",
              "a[href*='/company/']",
              "[data-testid='company']",
              "[data-testid='jobHeaderCompanyLogo'][title]",
              "#BigJobCardId [data-testid='company']",
              "[data-test='job-details-header'] h4",
              "[class*='JobDetails_jobDetailsHeader'] h4",
              "[class*='EmployerProfile_employerNameHeading'] h4",
              "[class*='EmployerProfile_profileContainer'] h4",
              "[data-testid='job-preview-company-name']",
              "[data-testid='job-preview-company'] span",
              "[data-testid='right-pane'] a[href*='/co/'] span",
              "[data-testid='right-pane'] a[href*='/co/']",
              "a[href*='/co/'] span",
              "a[href*='/co/']",
              ".field-name-field-header-job-company",
              ".application-form-header--company-name",
              "[data-testid='company-name']",
              ".job-details-jobs-unified-top-card__company-name",
              ".jobs-unified-top-card__company-name",
              "[data-testid='company-info-metadata'] a",
              "[data-testid='company-info-metadata']",
              "[data-testid='inlineHeader-companyName']",
              "[data-test='employer-name']",
              "a.topcard__org-name-link",
              ".company-name",
              ".posting-headline .employer",
              "[data-automation-id='companyName']",
            ]);

            function isValidCo(c: string | null | undefined): boolean {
              if (!c) return false;
              const trimmed = c.trim();
              if (trimmed.length < 2 || trimmed.length > 100) return false;
              if (
                /^(jobs?|careers?|search|company|apply|sign in|home|navigation|menu|ziprecruiter|indeed|linkedin|glassdoor|jobleads|monster)$/i.test(
                  trimmed
                )
              ) {
                return false;
              }
              if (/,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(trimmed)) return false;
              if (/^\d{5}(?:-\d{4})?$/.test(trimmed)) return false;
              if (/^(?:remote|hybrid|on-site|onsite)(?:\s+in\s+.*)?$/i.test(trimmed)) return false;
              const lower = trimmed.toLowerCase().replace(/[^a-z]/g, "");
              const US_STATES: Record<string, string> = {
                alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",delaware:"DE",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",massachusetts:"MA",michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV",newhampshire:"NH",newjersey:"NJ",newmexico:"NM",newyork:"NY",northcarolina:"NC",northdakota:"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA",rhodeisland:"RI",southcarolina:"SC",southdakota:"SD",tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",virginia:"VA",washington:"WA",westvirginia:"WV",wisconsin:"WI",wyoming:"WY"
              };
              if (US_STATES[lower]) return false;
              return true;
            }

            let domLocation = "";
            const locEls = qAll([
              "[data-testid='jobDetailLocation']",
              "#BigJobCardId [data-testid='jobDetailLocation']",
              ".field-name-field-header-job-location",
              "[data-test='job-details-header'] [data-test='location']",
              "[class*='JobDetails_locationAndPay'] [data-test='location']",
              "[data-testid='job-card-chip-location']",
              "[data-slot='dialog-content'] .tag-text",
              "[data-testid='company-info-metadata'] .css-146c3p1",
              ".tag-text",
              "[data-testid='right-pane'] span.html-span",
              "[data-testid='job-location']",
              "span.f49gpp",
              ".job-details-jobs-unified-top-card__bullet",
              ".jobs-unified-top-card__bullet",
              ".topcard__flavor--bullet",
              "[data-testid='inlineHeader-companyLocation']",
              "[data-test='location']",
              ".location",
              "div.css-146c3p1",
              "[data-automation-id='locations']",
            ]);
            for (const el of locEls) {
              const t = clean(el.textContent || el.getAttribute("aria-label") || "");
              if (!t || t.length > 80 || t.includes("$") || /^(apply|sign in|full[- ]time|part[- ]time)/i.test(t)) continue;
              if (/,\s*[A-Z]{2}\b/.test(t) || /\b(?:remote|hybrid|on-site|onsite)\b/i.test(t) || /\([A-Z]{2}\)/.test(t) || /remote\s+in\s+/i.test(t)) {
                domLocation = t;
                break;
              }
            }

            if (domLocation) {
              const locMatch = domLocation.match(/\b([A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?)\b/);
              if (locMatch) {
                domLocation = locMatch[1];
              } else {
                const parenMatch = domLocation.match(/([A-Za-z\s.-]+)\s*\(([A-Z]{2})\)/i);
                if (parenMatch) {
                  domLocation = `${parenMatch[1].trim()}, ${parenMatch[2].toUpperCase()}`;
                } else if (/remote\s*in\s*([a-z]+)/i.test(domLocation)) {
                  const m = domLocation.match(/remote\s*in\s*([a-z]+)/i);
                  domLocation = `${m ? m[1] : ""}, Remote`;
                }
              }
            }

            let domSalary = "";
            const salEls = qAll([
              "[data-testid='jobDetailSalary']",
              "[data-testid='jobDetailSubtitle'] ~ span",
              "[data-testid='svx-job-salary']",
              "#BigJobCardId [data-testid='svx-job-salary']",
              ".field-name-field-job-salary",
              "[id^='jd-salary-']",
              "[data-test='job-details-header'] [data-test='detailSalary']",
              "[class*='JobDetails_locationAndPay'] [data-test='detailSalary']",
              "[data-testid='job-card-chip-salary']",
              "[data-test='detailSalary']",
              "[data-testid='salary-row']",
              ".job-details-jobs-unified-top-card__job-insight--highlight",
              ".job-details-jobs-unified-top-card__job-insight",
              "[data-testid='attribute_snippets_section']",
              "div.css-146c3p1",
              ".salary",
            ]);
            for (const el of salEls) {
              const t = clean(el.textContent || "");
              if (!t || t.length > 80) continue;
              if ((t.includes("$") || t.includes("€") || t.includes("£")) && (/\d/.test(t) || /hour|hr|year|yr|month|week/i.test(t))) {
                domSalary = t;
                break;
              }
            }

            const domLogo = (() => {
              const selectors = [
                "[data-testid='jobHeaderCompanyLogo'] img",
                "img[data-testid='jobHeaderCompanyLogo']",
                "[data-test='job-details-header'] img",
                "[class*='EmployerProfile_profileContainer'] img",
                "img[src*='media.glassdoor.com']",
                "[data-testid='company-widget-logo']",
                "img[data-testid='company-widget-logo']",
                ".jobsearch-CompanyAvatar-image",
                "[data-testid='company-logo']",
                "[data-testid='company-logo-shadow']",
                "[data-testid='company-logo'] img",
                "img[data-automation-id='image']",
                "[data-automation-id='logoLink'] img",
                ".job-details-jobs-unified-top-card__company-logo img",
                ".jobs-unified-top-card__company-logo img",
                ".topcard__logo-container img",
                "img[src*='media.licdn.com/dms/image/'][src*='company-logo']",
                "img[data-delayed-url*='company-logo']",
                "img[alt*='Company logo']",
                "[data-testid='right-pane'] img[src*='logo']",
                ".company-logo__logo",
                ".company-logo img",
                ".EmployerProfile_employerLogo__ img",
                "[data-test='employer-logo'] img",
                "img[src*='images.indeed.com']",
                "img[src*='monster.com']",
                "img[src*='myworkdayjobs.com']",
                "img[src*='workdaycdn.com']",
                "img[src*='cloudfront.net']",
                "img[alt*='logo' i]",
              ];
              for (const sel of selectors) {
                const el = doc.querySelector(sel);
                if (el) {
                  // Ignore navigation avatars
                  if (el.closest(".global-nav, .nav, header nav") && !el.closest(".job-details-jobs-unified-top-card__company-logo, [data-testid='company-logo']")) {
                    continue;
                  }
                  const styleAttr = el.getAttribute("style") || el.querySelector("[style*='background-image']")?.getAttribute("style") || "";
                  if (styleAttr.includes("background-image")) {
                    const bgMatch = styleAttr.match(/background-image:\s*url\(([^)]+)\)/i);
                    if (bgMatch) {
                      const cleaned = bgMatch[1].replace(/['"]/g, "").trim();
                      if (cleaned && !/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(cleaned)) {
                        if (/^https?:\/\//i.test(cleaned) || (cleaned.startsWith("data:image/") && cleaned.length >= 200)) {
                          return cleaned;
                        }
                      }
                    }
                  }
                  const src =
                    el.getAttribute("src") ||
                    el.getAttribute("srcset")?.split(/\s*,\s*|\s+/)[0] ||
                    el.getAttribute("data-src") ||
                    el.getAttribute("data-delayed-url") ||
                    el.getAttribute("data-ghost-url");
                  if (src && !src.includes("svg+xml")) {
                    const trimmed = src.trim();
                    if (trimmed.startsWith("data:") && trimmed.length < 200) continue;
                    if (/profile-displayphoto|profile-framedphoto|ghost-person|company-banner|banner/i.test(trimmed)) continue;
                    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/")) {
                      return trimmed;
                    }
                  }
                }
              }
              const scripts = doc.querySelectorAll('script[type="application/ld+json"], script[type*="ld+json"]');
              for (const s of Array.from(scripts)) {
                try {
                  const parsed = JSON.parse(s.textContent || "");
                  const items = Array.isArray(parsed) ? parsed : [parsed];
                  for (const item of items) {
                    if ((item["@type"] === "LocalBusiness" || item["@type"] === "Organization") && typeof item.image === "string") {
                      return item.image.trim();
                    }
                  }
                } catch {}
              }
              return undefined;
            })();

            // High-confidence description selectors before falling back to generic containers
            const domDescEl = (() => {
              const selectors = [
                "[data-testid='jobDetailDescription']",
                "[data-testid='svx-description-container-inner']",
                "#BigJobCardId [data-testid='svx-description-container-inner']",
                ".field-name-body",
                "[class*='JobDetails_jobDescription']",
                "[data-test='jobDescription']",
                ".jobDescriptionContent",
                "#JobDescriptionContainer",
                "[data-testid='job-preview-description']",
                ".job-content-scrollable",
                ".job-preview2024",
                "#jobDescriptionText",
                ".simple-job-description-html",
                ".react-native-html-content",
                "[data-testid='expandable-text-box']",
                "[data-testid='job-details']",
                "#job-details",
                ".jobs-description__content",
                ".show-more-less-html__markup",
                "[data-test='job-description']",
                ".posting-description",
                ".section-page",
                "[data-automation-id='jobPostingDescription']",
                "#job-description",
              ];
              for (const sel of selectors) {
                try {
                  const el = doc.querySelector(sel);
                  if (el) return el;
                } catch {}
              }
              return null;
            })();
            const domDescHtml = domDescEl?.innerHTML || "";
            const domDesc = domDescEl ? clean(domDescEl.textContent) : "";

            // Parse title & company cleanly from compound document title if needed
            let rawTitle = jsonLdResult?.title || domTitle || clean(doc.title);
            let rawCompany = (isValidCo(jsonLdResult?.company) ? jsonLdResult?.company : "") || (isValidCo(domCompany) ? domCompany : "");

            if (href.includes("indeed.com") || doc.querySelector("[data-testid='jobDetailSubtitle']")) {
              const cmpSub = doc.querySelector("[data-testid='jobDetailSubtitle']");
              if (cmpSub && cmpSub.textContent) {
                const parts = cmpSub.textContent.split(/\s+-\s+/);
                if (parts.length >= 2) {
                  rawCompany = clean(parts[0]);
                  domLocation = clean(parts[1]);
                }
              }
            }

            if (href.includes("ziprecruiter.com") && (!rawCompany || !isValidCo(rawCompany))) {
              const zrCoLink = (doc.querySelector("[data-testid='right-pane'] a[href*='/co/']") || doc.querySelector("a[href*='/co/']")) as HTMLAnchorElement | null;
              if (zrCoLink) {
                const linkText = clean(zrCoLink.textContent);
                if (isValidCo(linkText)) {
                  rawCompany = linkText;
                } else {
                  const m = (zrCoLink.getAttribute("href") || "").match(/\/co\/([^\/?#\s]+)/i);
                  if (m) {
                    const slug = m[1].replace(/[-_]+/g, " ").trim();
                    if (isValidCo(slug)) rawCompany = slug;
                  }
                }
              }
            }

            if (/jobleads\.com/i.test(href + doc.title)) {
              rawTitle = rawTitle.replace(/\s*-\s*[A-Za-z\s.-]+(?:\s*\|\s*JobLeads)?$/i, "").trim();
            } else {
              const pipeTripleMatch = rawTitle.match(
                /^(.+?)\s*([|｜•·])\s*([^|｜•·]+?)\s*\2\s*(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter|JobLeads|Greenhouse|Lever|Ashby|Workday|Monster)/i
              );
              if (pipeTripleMatch) {
                rawTitle = pipeTripleMatch[1].trim();
                const tok2 = pipeTripleMatch[3].trim();
                if (!rawCompany && isValidCo(tok2) && !/,\s*[A-Z]{2}(?:\s+\d{5})?$/i.test(tok2)) {
                  rawCompany = tok2;
                }
              } else {
                const tripleMatch = rawTitle.match(
                  /^(.+?)\s*[|｜•·-]\s*(.+?)\s*[|｜•·-]\s*(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter|JobLeads|Greenhouse|Lever|Ashby|Workday|Monster)/i
                );
                if (tripleMatch) {
                  rawTitle = tripleMatch[1].trim();
                  if (!rawCompany && isValidCo(tripleMatch[2].trim())) rawCompany = tripleMatch[2].trim();
                } else {
                  const pipeMatch = rawTitle.match(/^([^|｜]+?)\s*[|｜]\s*([^|｜]+)$/);
                  if (pipeMatch && !/hiring|jobs? in|careers?/i.test(pipeMatch[1])) {
                    rawTitle = pipeMatch[1].trim();
                    if (!rawCompany) {
                      const compCandidate = pipeMatch[2].replace(/\s*-\s*\d+$/, "").trim();
                      if (isValidCo(compCandidate)) rawCompany = compCandidate;
                    }
                  } else {
                    rawTitle = rawTitle
                      .replace(
                        /\s*[|｜•·-]\s*(?:LinkedIn|Indeed|Glassdoor|ZipRecruiter|JobLeads|Greenhouse|Lever|Ashby|Workday|Monster|Careers?).*$/i,
                        ""
                      )
                      .trim();
                    if (rawCompany && rawTitle.toLowerCase().includes(rawCompany.toLowerCase())) {
                      rawTitle = rawTitle
                        .replace(new RegExp(`\\s*[|｜•·-]\\s*${rawCompany}.*$`, "i"), "")
                        .trim();
                    }
                  }
                }
              }
            }

            if (!rawCompany || !isValidCo(rawCompany)) {
              const inlineComp = doc.body.innerHTML.match(/<b>\s*<strong>\s*Company:\s*<\/strong>\s*<\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<p|<br|<\/div|<\/p)/i);
              if (inlineComp && isValidCo(inlineComp[1])) rawCompany = clean(inlineComp[1]);
            }
            if (!domLocation) {
              const inlineLoc = doc.body.innerHTML.match(/<b>\s*<strong>\s*Location:\s*<\/strong>\s*<\/b>\s*([A-Za-z0-9&.,' -]+?)(?:<p|<br|<\/div|<\/p)/i);
              if (inlineLoc) domLocation = clean(inlineLoc[1]);
            }
            if (!domSalary) {
              const inlineSal = doc.body.innerHTML.match(/<b>\s*<strong>\s*(?:Compensation|Base Pay|Salary|Pay):\s*<\/strong>\s*<\/b>\s*([^<]+)/i);
              if (inlineSal) domSalary = clean(inlineSal[1]);
            }

            const hasRichHtml = (str?: string) => /<(?:p|h[1-6]|ul|ol|li|strong|b|br|div)\b/i.test(str || "");
            const rawDescCandidate =
              (jsonLdResult?.description && hasRichHtml(jsonLdResult.rawDescription))
                ? jsonLdResult.description
                : (domDescHtml && (hasRichHtml(domDescHtml) || !jsonLdResult?.description || !hasRichHtml(jsonLdResult.rawDescription)))
                ? htmlToMd(domDescHtml) || domDesc
                : jsonLdResult?.description ||
                  domDesc ||
                  clean(doc.body.innerText).slice(0, 5000);

            const finalDescription = stripChrome(rawDescCandidate);

            let finalSalary = jsonLdResult?.salary || domSalary || undefined;
            if (!finalSalary && finalDescription) {
              const salMatch =
                finalDescription.match(
                  /(?:pay\s+range|salary\s+range|base\s+pay|starting\s+pay|hourly\s+rate|compensation|pay|salary)[:\s]+([$€£]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:k|K)?\s*(?:-|–|—|to)\s*[$€£]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:k|K)?(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hours?|yr|years?|week|weeks?|wk|month|months?|mo))?|[$€£]\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:k|K)?(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hours?|yr|years?|week|weeks?|wk|month|months?|mo))?)/i
                ) ||
                finalDescription.match(
                  /([$€£]\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:k|K)?\s*(?:-|–|—|to)\s*[$€£]?\s*\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\s*(?:k|K)?(?:\s*(?:\/|\s*per\s*|\s*an\s*|\s*a\s*)(?:hr|hours?|yr|years?|week|weeks?|wk|month|months?|mo))?)/i
                );
              if (salMatch && salMatch[1]) finalSalary = clean(salMatch[1]);
            }

            // State elevation for location
            let finalLocation = jsonLdResult?.location || domLocation || undefined;
            if (domLocation && /,\s*[A-Z]{2}\b/.test(domLocation) && (!finalLocation || !/,\s*[A-Z]{2}\b/.test(finalLocation))) {
              finalLocation = domLocation;
            }

            const canonical = (doc.querySelector("link[rel='canonical']") as HTMLLinkElement)?.href;
            let finalUrl = href;
            if (/glassdoor\.com/i.test(href)) {
              const activeJlid = (doc.querySelector("[id^='jd-job-title-'], [id^='jd-salary-']")?.id || "").match(/\d{10,}/)?.[0];
              if (activeJlid) {
                const jlidAnchor = doc.querySelector(`a[href*='${activeJlid}']`) as HTMLAnchorElement | null;
                if (jlidAnchor?.href) finalUrl = jlidAnchor.href;
                else finalUrl = `https://www.glassdoor.com/job-listing/?jl=${activeJlid}`;
              } else if (canonical && /glassdoor\.com\/job-listing\//i.test(canonical)) {
                finalUrl = canonical;
              } else {
                const sel = doc.querySelector("[class*='JobsList_selected'] a[href*='job-listing']") as HTMLAnchorElement | null;
                if (sel?.href) {
                  finalUrl = sel.href;
                }
              }
            } else if (/jobleads\.com/i.test(href)) {
              if (canonical && /jobleads\.com\/[a-z]{2}\/job\//i.test(canonical)) {
                finalUrl = canonical;
              } else if (href.includes("/job/") && !href.includes("?from=")) {
                finalUrl = href;
              } else {
                const activeCard = doc.querySelector("[data-active='true'] a[href*='/job/'], [data-active='true'] [data-testid='search-job-card-link'], [data-testid='job-preview-card'] a[href*='/job/']") as HTMLAnchorElement | null;
                if (activeCard?.href && !activeCard.href.includes("from=")) {
                  finalUrl = activeCard.href;
                }
              }
            } else if (/monster\.com/i.test(href)) {
              if (canonical && /monster\.com\/job-openings\//i.test(canonical)) {
                finalUrl = canonical;
              } else {
                const directM = doc.querySelector("#BigJobCardId a[href*='/job-openings/'], [data-test-id='svx-split-view-job-panel'] a[href*='/job-openings/']") as HTMLAnchorElement | null;
                if (directM) {
                  let mHref = directM.getAttribute("href") || directM.href || "";
                  if (mHref.startsWith("//")) mHref = `https:${mHref}`;
                  else if (mHref.startsWith("/")) mHref = `https://www.monster.com${mHref}`;
                  if (mHref) finalUrl = mHref;
                }
              }
            }

            return {
              title: rawTitle || "Job Opportunity",
              company: (isValidCo(rawCompany) ? rawCompany : "") || "Company",
              location: finalLocation,
              salary: finalSalary,
              logoUrl: jsonLdResult?.logoUrl || domLogo || undefined,
              url: finalUrl,
              description: finalDescription,
              source: href.includes("linkedin")
                ? "LinkedIn"
                : href.includes("greenhouse.io")
                ? "Greenhouse"
                : href.includes("lever.co")
                ? "Lever"
                : href.includes("ashbyhq.com")
                ? "Ashby"
                : href.includes("workday")
                ? "Workday"
                : href.includes("jobleads")
                ? "JobLeads"
                : href.includes("monster")
                ? "Monster"
                : href.includes("indeed")
                ? "Indeed"
                : href.includes("glassdoor")
                ? "Glassdoor"
                : href.includes("ziprecruiter")
                ? "ZipRecruiter"
                : href.includes("careers")
                ? "Careers"
                : "Web",
              extractedAt: new Date().toISOString(),
            };
          }
