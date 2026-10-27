-- ============================================================================
-- SRM College Query Assistant — Baseline College Knowledge Seed Data
-- Run this in Supabase SQL Editor to pre-populate core college knowledge
-- ============================================================================

INSERT INTO public.knowledge_chunks (id, source_type, title, url, category, academic_year, content)
VALUES
(
  'seed-fee-btech-2026',
  'website',
  'SRMIST Delhi-NCR — B.Tech Fee Structure (2026-27)',
  'https://www.srmup.in/admissions/fee-structure',
  'Fees & Scholarships',
  '2026',
  '### B.Tech Annual Tuition Fee Structure (2026-2027)

| Branch / Specialization | Tuition Fee (Per Annum) | Registration & Exam Fee | Total Annual Fee |
| :--- | :--- | :--- | :--- |
| B.Tech Computer Science & Engineering (CSE) | ₹3,00,000 | ₹15,000 | ₹3,15,000 |
| B.Tech CSE (AI & Machine Learning) | ₹3,00,000 | ₹15,000 | ₹3,15,000 |
| B.Tech CSE (Data Science) | ₹2,75,000 | ₹15,000 | ₹2,90,000 |
| B.Tech Electronics & Communication (ECE) | ₹2,00,000 | ₹15,000 | ₹2,15,000 |
| B.Tech Mechanical Engineering | ₹1,75,000 | ₹15,000 | ₹1,90,000 |
| B.Tech Electrical & Electronics (EEE) | ₹1,75,000 | ₹15,000 | ₹1,90,000 |

*Note: A one-time refundable security deposit of ₹10,000 is payable at the time of admission.*'
),
(
  'seed-hostel-mess-2026',
  'website',
  'SRMIST Delhi-NCR — Hostel Accommodation & Mess Charges (2026)',
  'https://www.srmup.in/campus-life/hostel',
  'Hostel & Campus Rules',
  '2026',
  '### Hostel & Mess Fee Schedule

| Room Type | AC / Non-AC | Annual Hostel Fee | Annual Mess Charges | Total Annual Cost |
| :--- | :--- | :--- | :--- | :--- |
| 3-Sharing Room | Non-AC | ₹65,000 | ₹55,000 | ₹1,20,000 |
| 3-Sharing Room | AC | ₹95,000 | ₹55,000 | ₹1,50,000 |
| 2-Sharing Premium | AC | ₹1,20,000 | ₹55,000 | ₹1,75,000 |

### Key Hostel Policies:
1. In-time for hostel residents is strictly 8:30 PM on weekdays and 9:00 PM on weekends.
2. High-wattage electrical appliances (heaters, induction cooktops, irons) are prohibited.
3. Mess serves pure vegetarian and non-vegetarian menus on designated days with 4 meals daily (Breakfast, Lunch, Evening Snacks, Dinner).
4. Ragging in any form inside hostel premises leads to immediate expulsion and police action.'
),
(
  'seed-placements-2026',
  'website',
  'SRMIST Delhi-NCR — Placement Statistics & Top Recruiters',
  'https://www.srmup.in/placements/overview',
  'Placements & Careers',
  '2026',
  '### Placement Highlights & Statistics

| Metric | Statistic / Record |
| :--- | :--- |
| Highest Package Offered | ₹50.0 LPA |
| Average Package (CSE / IT) | ₹8.5 LPA |
| Overall Average Package | ₹6.8 LPA |
| Total Offers Made | 1200+ |
| Marquee / Dream Offers (>10 LPA) | 350+ |

### Top Regular Recruiters:
- Microsoft, Amazon, Google, Adobe, Cisco, PayPal
- TCS (Digital & Ninja), Infosys, Wipro, Cognizant, Capgemini
- Deloitte, PwC, EY, KPMG
- Schneider Electric, Hyundai, Bosch

Eligibility: Students with 60% or 6.5 CGPA throughout 10th, 12th, and B.Tech with no active backlogs are eligible for Day-1 placement drives.'
),
(
  'seed-scholarships-2026',
  'website',
  'SRMIST Delhi-NCR — Founder Scholarship & Merit Concessions',
  'https://www.srmup.in/admissions/scholarships',
  'Fees & Scholarships',
  '2026',
  '### Merit-Based Scholarships

| Category | Eligibility Criteria | Tuition Fee Waiver |
| :--- | :--- | :--- |
| Founder’s Scholarship | Top 100 in SRMJEEE / 95%+ in PCM CBSE | 100% Tuition & Hostel Waiver |
| SRM Merit Scholarship | Rank 101 - 500 in SRMJEEE | 75% Tuition Fee Waiver |
| State Board Toppers | Rank 1 in State Board Exams | 100% Tuition Fee Waiver |
| Defense Personnel Ward | Wards of serving / retired Indian Armed Forces | 25% Tuition Fee Concession |
| Sports Scholarship | National / International sports medalists | 50% - 100% Fee Concession |

*Note: Scholarships must be renewed annually by maintaining a minimum CGPA of 8.0 without any backlogs.*'
),
(
  'seed-library-rules-2026',
  'website',
  'SRMIST Delhi-NCR — Central Library Timings & Rules',
  'https://www.srmup.in/academics/central-library',
  'Academics & Timetable',
  '2026',
  '### Central Library Information

| Service | Details |
| :--- | :--- |
| General Timings | 8:30 AM to 8:30 PM (Monday to Saturday) |
| Examination Period Timings | 8:00 AM to 10:00 PM (Including Sundays) |
| Book Borrowing Limit (UG Students) | 4 Books for 14 Days |
| Book Borrowing Limit (PG / Ph.D.) | 6 Books for 30 Days |
| Overdue Fine | ₹5 per book per day after due date |

Digital Library access provides remote IEEE Xplore, ScienceDirect, Springer, and ACM Digital Library subscriptions accessible through student institutional email.'
),
(
  'seed-anti-ragging-2026',
  'website',
  'SRMIST Delhi-NCR — Anti-Ragging Policy & Helplines',
  'https://www.srmup.in/anti-ragging',
  'Hostel & Campus Rules',
  '2026',
  '### Zero-Tolerance Anti-Ragging Policy
SRMIST enforces strict zero tolerance towards ragging as per UGC and Supreme Court regulations.

### Emergency Helplines:
- 24x7 Anti-Ragging National Toll-Free Helpline: 1800-180-5522
- SRMIST Delhi-NCR Campus Helpline: +91-1232-234300 / 234301
- Campus Proctor Email: proctor@srmup.in
- National Anti-Ragging Portal: helpline@antiragging.in

Any student found indulging in ragging will face suspension, expulsion, cancellation of admission, and lodging of FIR with Uttar Pradesh Police.'
)
ON CONFLICT (id) DO UPDATE 
SET title = EXCLUDED.title, content = EXCLUDED.content, category = EXCLUDED.category;
