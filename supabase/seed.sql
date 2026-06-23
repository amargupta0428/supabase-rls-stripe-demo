-- ============================================================================
--  Seed data: ~20 fake "business for sale" listings + gated details.
--  Safe to re-run: clears and reinserts.
-- ============================================================================

begin;

delete from public.listing_details;
delete from public.listings;

with seed(title, category, location, teaser, price_band,
          asking_price, annual_revenue, cash_flow, ebitda, established_year,
          employees, reason_for_selling, full_description, seller_contact_email) as (
  values
  ('Established HVAC Service Company','HVAC','Phoenix, AZ','20+ years serving the Valley. Recurring maintenance contracts.','$750K–$1M',
   895000,1850000,420000,360000,2003,14,'Owner retiring',
   '14 technicians, 9 trucks, 600+ active maintenance agreements generating predictable recurring revenue. Strong commercial book.','seller1@example.com'),
  ('Residential Plumbing & Drain Co.','Plumbing','Austin, TX','Booked 3 weeks out. Stellar online reviews.','$500K–$750K',
   640000,1320000,310000,265000,2009,11,'Relocating out of state',
   '4.9-star average across 800+ reviews. Fleet of 7 vans, fully permitted, established supplier relationships.','seller2@example.com'),
  ('Commercial Landscaping & Maintenance','Landscaping','Denver, CO','Year-round contracts incl. snow removal.','$250K–$500K',
   415000,980000,205000,180000,2012,18,'Pursuing other ventures',
   'Diversified revenue: commercial grounds maintenance, irrigation, and winter snow contracts. Equipment included.','seller3@example.com'),
  ('Auto Repair & Tire Shop','Automotive','Columbus, OH','6 bays, loyal customer base, real estate available.','$500K–$750K',
   560000,1100000,240000,210000,2006,9,'Health reasons',
   'Six service bays plus alignment rack. Established 18 years. Real estate available separately or as package.','seller4@example.com'),
  ('Boutique Digital Marketing Agency','Services','Remote / Chicago, IL','MRR-based, blue-chip retainer clients.','$750K–$1M',
   820000,1450000,510000,470000,2015,12,'Founder moving into advisory',
   'Recurring monthly retainers averaging $9K. Diversified across 22 clients, none over 12% of revenue.','seller5@example.com'),
  ('Family-Owned Italian Restaurant','Restaurant','Providence, RI','Neighborhood institution, full liquor license.','$250K–$500K',
   380000,1240000,165000,140000,1998,22,'Second-generation owner retiring',
   'Beloved local spot with full bar, 120 seats, and a strong catering side business. Liquor license transfers.','seller6@example.com'),
  ('Self-Storage Facility','Real Estate','Tampa, FL','92% occupancy, automated access, absentee-friendly.','$1M+',
   2150000,640000,455000,440000,2010,2,'Portfolio rebalancing',
   '420 units at 92% occupancy. Automated gate and online payments make this nearly absentee. Land for expansion.','seller7@example.com'),
  ('Electrical Contracting Business','Electrical','Sacramento, CA','Commercial + residential, licensed crew.','$500K–$750K',
   590000,1380000,295000,250000,2008,13,'Owner pursuing development projects',
   'C-10 licensed. Mix of tenant improvement, service, and new construction. Strong GC relationships.','seller8@example.com'),
  ('Specialty Coffee Roaster & Cafe','Food & Beverage','Portland, OR','Wholesale accounts + retail cafe.','$250K–$500K',
   340000,720000,135000,118000,2014,8,'Relocating abroad',
   'Roasting operation supplying 30 wholesale accounts plus a busy flagship cafe. Equipment and brand included.','seller9@example.com'),
  ('Pest Control Route Business','Services','Charlotte, NC','Recurring quarterly contracts, low overhead.','$250K–$500K',
   295000,560000,175000,160000,2011,5,'Owner retiring',
   '900+ recurring residential accounts on quarterly plans. Two trucks, low overhead, simple to operate.','seller10@example.com'),
  ('Commercial Cleaning Company','Services','Minneapolis, MN','Nightly office contracts, trained crews.','$250K–$500K',
   320000,890000,150000,132000,2013,24,'Starting a new business',
   'Janitorial contracts with 18 office and medical clients on auto-renew. Trained, vetted crews in place.','seller11@example.com'),
  ('Craft Brewery & Taproom','Food & Beverage','Asheville, NC','Award-winning, distribution in 3 states.','$1M+',
   1650000,1980000,360000,310000,2013,16,'Partners exiting',
   '15-bbl brewhouse, popular taproom, and distribution across NC/SC/TN. Multiple medal-winning core beers.','seller12@example.com'),
  ('Medical Billing Service','Healthcare','Remote / Nashville, TN','Sticky B2B clients, high margins.','$500K–$750K',
   710000,1020000,395000,370000,2009,14,'Owner retiring',
   'Outsourced billing for 40+ small practices. Long tenured clients, recurring revenue, strong margins.','seller13@example.com'),
  ('Garage Door Sales & Install','Home Services','Las Vegas, NV','Builder relationships + service revenue.','$500K–$750K',
   525000,1160000,265000,235000,2010,10,'Owner relocating',
   'Steady new-construction installs plus a growing repair/service arm. Builder contracts in a fast-growing metro.','seller14@example.com'),
  ('Sign Manufacturing & Installation','Manufacturing','Kansas City, MO','In-house fabrication, national accounts.','$500K–$750K',
   620000,1340000,280000,245000,2005,15,'Retirement',
   'Full-service sign shop: design, fabrication, permitting, and installation. Several national franchise accounts.','seller15@example.com'),
  ('Pet Grooming & Boarding Facility','Pet Services','San Diego, CA','High-demand area, repeat clientele.','$250K–$500K',
   410000,680000,160000,142000,2012,9,'Family reasons',
   'Grooming, daycare, and boarding under one roof. Booked solid on weekends with a loyal repeat base.','seller16@example.com'),
  ('Industrial Equipment Rental','Equipment','Houston, TX','Fleet of late-model machines, B2B base.','$1M+',
   1850000,2240000,520000,475000,2007,12,'Owner consolidating holdings',
   'Earthmoving and aerial rental fleet serving contractors. Well-maintained, late-model equipment included.','seller17@example.com'),
  ('Franchise Sandwich Shop (3 Units)','Restaurant','Indianapolis, IN','Three profitable units, trained managers.','$500K–$750K',
   680000,1980000,255000,220000,2011,38,'Multi-unit operator simplifying',
   'Three established locations of a national brand, each with a trained GM. Absentee-ready with systems in place.','seller18@example.com'),
  ('Roofing Contractor','Construction','Orlando, FL','Storm + retail demand, strong crews.','$750K–$1M',
   870000,2650000,430000,385000,2008,26,'Owner retiring',
   'Residential and light-commercial roofing. Established insurance/storm pipeline plus retail. Crews and trucks included.','seller19@example.com'),
  ('IT Managed Services Provider','Technology','Remote / Seattle, WA','Per-seat MRR, multi-year contracts.','$1M+',
   1450000,1620000,560000,520000,2012,11,'Founder pursuing a new venture',
   'MSP with per-seat recurring contracts across 45 SMB clients. High net revenue retention, multi-year agreements.','seller20@example.com')
)
insert into public.listings (id, title, category, location, teaser, price_band)
select gen_random_uuid(), title, category, location, teaser, price_band
from seed;

-- Link details to the rows we just inserted (matched on title, which is unique here).
insert into public.listing_details (
  listing_id, asking_price, annual_revenue, cash_flow, ebitda,
  established_year, employees, reason_for_selling, full_description, seller_contact_email)
select l.id, s.asking_price, s.annual_revenue, s.cash_flow, s.ebitda,
       s.established_year, s.employees, s.reason_for_selling, s.full_description, s.seller_contact_email
from public.listings l
join (
  values
  ('Established HVAC Service Company',895000,1850000,420000,360000,2003,14,'Owner retiring','14 technicians, 9 trucks, 600+ active maintenance agreements generating predictable recurring revenue. Strong commercial book.','seller1@example.com'),
  ('Residential Plumbing & Drain Co.',640000,1320000,310000,265000,2009,11,'Relocating out of state','4.9-star average across 800+ reviews. Fleet of 7 vans, fully permitted, established supplier relationships.','seller2@example.com'),
  ('Commercial Landscaping & Maintenance',415000,980000,205000,180000,2012,18,'Pursuing other ventures','Diversified revenue: commercial grounds maintenance, irrigation, and winter snow contracts. Equipment included.','seller3@example.com'),
  ('Auto Repair & Tire Shop',560000,1100000,240000,210000,2006,9,'Health reasons','Six service bays plus alignment rack. Established 18 years. Real estate available separately or as package.','seller4@example.com'),
  ('Boutique Digital Marketing Agency',820000,1450000,510000,470000,2015,12,'Founder moving into advisory','Recurring monthly retainers averaging $9K. Diversified across 22 clients, none over 12% of revenue.','seller5@example.com'),
  ('Family-Owned Italian Restaurant',380000,1240000,165000,140000,1998,22,'Second-generation owner retiring','Beloved local spot with full bar, 120 seats, and a strong catering side business. Liquor license transfers.','seller6@example.com'),
  ('Self-Storage Facility',2150000,640000,455000,440000,2010,2,'Portfolio rebalancing','420 units at 92% occupancy. Automated gate and online payments make this nearly absentee. Land for expansion.','seller7@example.com'),
  ('Electrical Contracting Business',590000,1380000,295000,250000,2008,13,'Owner pursuing development projects','C-10 licensed. Mix of tenant improvement, service, and new construction. Strong GC relationships.','seller8@example.com'),
  ('Specialty Coffee Roaster & Cafe',340000,720000,135000,118000,2014,8,'Relocating abroad','Roasting operation supplying 30 wholesale accounts plus a busy flagship cafe. Equipment and brand included.','seller9@example.com'),
  ('Pest Control Route Business',295000,560000,175000,160000,2011,5,'Owner retiring','900+ recurring residential accounts on quarterly plans. Two trucks, low overhead, simple to operate.','seller10@example.com'),
  ('Commercial Cleaning Company',320000,890000,150000,132000,2013,24,'Starting a new business','Janitorial contracts with 18 office and medical clients on auto-renew. Trained, vetted crews in place.','seller11@example.com'),
  ('Craft Brewery & Taproom',1650000,1980000,360000,310000,2013,16,'Partners exiting','15-bbl brewhouse, popular taproom, and distribution across NC/SC/TN. Multiple medal-winning core beers.','seller12@example.com'),
  ('Medical Billing Service',710000,1020000,395000,370000,2009,14,'Owner retiring','Outsourced billing for 40+ small practices. Long tenured clients, recurring revenue, strong margins.','seller13@example.com'),
  ('Garage Door Sales & Install',525000,1160000,265000,235000,2010,10,'Owner relocating','Steady new-construction installs plus a growing repair/service arm. Builder contracts in a fast-growing metro.','seller14@example.com'),
  ('Sign Manufacturing & Installation',620000,1340000,280000,245000,2005,15,'Retirement','Full-service sign shop: design, fabrication, permitting, and installation. Several national franchise accounts.','seller15@example.com'),
  ('Pet Grooming & Boarding Facility',410000,680000,160000,142000,2012,9,'Family reasons','Grooming, daycare, and boarding under one roof. Booked solid on weekends with a loyal repeat base.','seller16@example.com'),
  ('Industrial Equipment Rental',1850000,2240000,520000,475000,2007,12,'Owner consolidating holdings','Earthmoving and aerial rental fleet serving contractors. Well-maintained, late-model equipment included.','seller17@example.com'),
  ('Franchise Sandwich Shop (3 Units)',680000,1980000,255000,220000,2011,38,'Multi-unit operator simplifying','Three established locations of a national brand, each with a trained GM. Absentee-ready with systems in place.','seller18@example.com'),
  ('Roofing Contractor',870000,2650000,430000,385000,2008,26,'Owner retiring','Residential and light-commercial roofing. Established insurance/storm pipeline plus retail. Crews and trucks included.','seller19@example.com'),
  ('IT Managed Services Provider',1450000,1620000,560000,520000,2012,11,'Founder pursuing a new venture','MSP with per-seat recurring contracts across 45 SMB clients. High net revenue retention, multi-year agreements.','seller20@example.com')
) as s(title, asking_price, annual_revenue, cash_flow, ebitda, established_year, employees, reason_for_selling, full_description, seller_contact_email)
  on s.title = l.title;

commit;
