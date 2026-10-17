/**
 * Fictional CV texts for tests. Every name, company, address, number and
 * link is invented; email domains use the reserved example.* names and
 * phone numbers use Ofcom's drama ranges.
 */

/** A conventional UK CV: header, then dated roles and education. */
export const CLASSIC_CV = `ALEX SAMPLE
Product Designer
London, United Kingdom | +44 7700 900123 | alex.sample@example.com
linkedin.com/in/alex-sample | github.com/alexsample | alexsample.design

Profile
Product designer with six years of experience in booking and travel tools.

Experience
Senior Product Designer | Northwind Ltd | Jan 2021 – Present
• Led the redesign of the onboarding flow, increasing activation by 18%.
• Built and maintained the design system used by 40 engineers.
Product Designer | Halden Studio | Mar 2018 – Dec 2020
• Designed booking tools used by 1,250,000 people a month.

Education
University of Example
BSc (Hons) Computer Science, First Class Honours
Sep 2014 – Jun 2017

Skills
Figma, Prototyping, Research`;

/**
 * Education before experience, labelled contact details, years-only dates,
 * "Title at Employer", and headers split across lines.
 */
export const REORDERED_CV = `Curriculum Vitae
Sam Example-Jones
Email: sam.example@example.org
Mobile: 07700 900456

EDUCATION
Bachelor of Arts in History — University College Example, 2016 – 2019
A levels: History, English, Maths
Example Sixth Form College, 2014 – 2016

WORK EXPERIENCE
Marketing Assistant at Acme Corporation
June 2019 – August 2020
Drafted campaign copy for product launches.
Junior Marketing Executive, Brightside
September 2020 – Present
- Ran weekly email campaigns.

Interests
Running, photography`;

/** Contact details only, without any section headings. */
export const CONTACT_ONLY_CV = `Jordan Placeholder
jordan.placeholder@example.net · 020 7946 0991
Portfolio: https://jordan-placeholder.example.dev/work`;

/** Roles whose title and employer cannot be told apart, with year-only dates. */
export const AMBIGUOUS_CV = `Riley Testcase
riley@example.com

Experience
Northfield, Southgate 2019 - 2021
Did various things.`;
