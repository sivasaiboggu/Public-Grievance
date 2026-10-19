import hashlib
import io
import json
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta

from PIL import Image, ImageDraw
from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import (
    Assignment,
    Category,
    CategoryRecord,
    Complaint,
    ComplaintStatus,
    Evidence,
    Notification,
    Role,
    StatusEvent,
    Team,
    User,
    EscalationEvent,
    IncidentLink,
    MLPrediction,
    MLFeedback,
    SystemSetting,
    IncidentCluster,
    IncidentClusterMember,
    PhotoSignal,
)
from app.notifications import backfill_notifications
from app.security import password_hasher
from app.storage import get_storage

DEMO_CATEGORIES = [
    {
        "code": "road_damage",
        "label": "Road damage",
        "description": "Potholes, cracks, broken edges.",
        "target_hours": 120,
        "first_response_hours": 24,
        "fix_hours": 120,
        "escalate_after_hours": 48,
        "icon": "AlertTriangle",
        "photo_rule": "required",
        "team_name": "Roads & Pavements",
        "sort_order": 1,
        "active": True,
    },
    {
        "code": "garbage",
        "label": "Garbage",
        "description": "Overflowing bins, dumping.",
        "target_hours": 48,
        "first_response_hours": 12,
        "fix_hours": 48,
        "escalate_after_hours": 24,
        "icon": "Trash2",
        "photo_rule": "required",
        "team_name": "Sanitation & Waste",
        "sort_order": 2,
        "active": True,
    },
    {
        "code": "waterlogging",
        "label": "Waterlogging",
        "description": "Water standing on the road.",
        "target_hours": 24,
        "first_response_hours": 4,
        "fix_hours": 24,
        "escalate_after_hours": 12,
        "icon": "Droplets",
        "photo_rule": "required",
        "team_name": "Drainage & Stormwater",
        "sort_order": 3,
        "active": True,
    },
    {
        "code": "open_drain",
        "label": "Manhole or open drain",
        "description": "Missing or broken manhole covers, open drains.",
        "target_hours": 24,
        "first_response_hours": 2,
        "fix_hours": 24,
        "escalate_after_hours": 12,
        "icon": "CircleDot",
        "photo_rule": "required",
        "team_name": "Drainage & Stormwater",
        "sort_order": 4,
        "active": True,
    },
    {
        "code": "damaged_property",
        "label": "Damaged public property",
        "description": "Broken footpaths, road signs, or bus shelters.",
        "target_hours": 72,
        "icon": "ShieldAlert",
        "photo_rule": "required",
        "team_name": "Roads & Pavements",
        "sort_order": 5,
        "active": False,
    },
    {
        "code": "street_light",
        "label": "Street light",
        "description": "Broken or dark street lights and poles.",
        "target_hours": 48,
        "icon": "Sun",
        "photo_rule": "required",
        "team_name": "Roads & Pavements",
        "sort_order": 6,
        "active": False,
    },
    {
        "code": "water_supply",
        "label": "Water supply",
        "description": "Pipeline leak or contaminated water.",
        "target_hours": 24,
        "icon": "Waves",
        "photo_rule": "required",
        "team_name": "Water & Sewerage",
        "sort_order": 7,
        "active": False,
    },
    {
        "code": "other",
        "label": "Other",
        "description": "Other civic issues not listed above.",
        "target_hours": 72,
        "icon": "HelpCircle",
        "photo_rule": "required",
        "team_name": "Roads & Pavements",
        "sort_order": 99,
        "active": False,
    },
]

DEMO_TEAMS = [
    {"name": "Roads & Pavements", "description": "Handles asphalt repair, potholes, pavement fixing and road safety covers."},
    {"name": "Sanitation & Waste", "description": "Handles waste collection, dumpsters, clearing public litter and street sanitation."},
    {"name": "Drainage & Stormwater", "description": "Handles storm drains, flood water clearance, pump deployment and ditch maintenance."},
    {"name": "Water & Sewerage", "description": "Handles water supply lines, pipe leaks, and municipal sewerage connections."},
]

DEMO_USERS = [
    {
        "email": "citizen@grievancegrid.test",
        "name": "Aarav Sharma",
        "role": Role.CITIZEN,
        "password": "Citizen@12345",
        "phone": "+91 98450 11223",
        "team": None,
    },
    {
        "email": "officer@grievancegrid.test",
        "name": "Priya Patel",
        "role": Role.GRO,
        "password": "Officer@12345",
        "phone": "+91 98450 44556",
        "team": "Roads & Pavements",
    },
    {
        "email": "officer2@grievancegrid.test",
        "name": "Kavita Rao",
        "role": Role.GRO,
        "password": "Officer@12345",
        "phone": "+91 98450 99881",
        "team": "Sanitation & Waste",
    },
    {
        "email": "field@grievancegrid.test",
        "name": "Rajesh Kumar",
        "role": Role.FIELD_OFFICER,
        "password": "Field@12345",
        "phone": "+91 98450 77889",
        "team": "Roads & Pavements",
    },
    {
        "email": "field2@grievancegrid.test",
        "name": "Anand Verma",
        "role": Role.FIELD_OFFICER,
        "password": "Field@12345",
        "phone": "+91 98450 33445",
        "team": "Sanitation & Waste",
    },
    {
        "email": "field3@grievancegrid.test",
        "name": "Biju Joseph",
        "role": Role.FIELD_OFFICER,
        "password": "Field@12345",
        "phone": "+91 98450 55667",
        "team": "Drainage & Stormwater",
    },
    {
        "email": "field4@grievancegrid.test",
        "name": "Suresh Babu",
        "role": Role.FIELD_OFFICER,
        "password": "Field@12345",
        "phone": "+91 98450 88990",
        "team": "Roads & Pavements",
    },
    {
        "email": "field5@grievancegrid.test",
        "name": "George Mathew",
        "role": Role.FIELD_OFFICER,
        "password": "Field@12345",
        "phone": "+91 98450 22334",
        "team": "Water & Sewerage",
    },
    {
        "email": "senior@grievancegrid.test",
        "name": "S. Ramanathan",
        "role": Role.SUPERVISOR,
        "password": "Senior@12345",
        "phone": "+91 98450 66778",
        "team": None,
    },
    {
        "email": "admin@grievancegrid.test",
        "name": "System Administrator",
        "role": Role.ADMIN,
        "password": "Admin@12345",
        "phone": "+91 98450 00001",
        "team": None,
    },
]

HOTSPOTS = [
    ("KB Jacob Road, Fort Kochi", 9.9658, 76.2422, "Fort Kochi"),
    ("Bazaar Road, Mattancherry", 9.9570, 76.2580, "Mattancherry"),
    ("Banerji Road, Ernakulam North", 9.9890, 76.2820, "Ernakulam North"),
    ("Kaloor-Kadavanthra Road, Kaloor", 9.9950, 76.2940, "Kaloor"),
    ("Toll Junction, Edappally", 10.0248, 76.3082, "Edappally"),
    ("Palarivattom Bypass Junction", 10.0050, 76.3120, "Palarivattom"),
    ("SA Road, Vyttila Junction", 9.9680, 76.3180, "Vyttila"),
    ("KP Vallon Road, Kadavanthra", 9.9620, 76.2990, "Kadavanthra"),
    ("Thevara Ferry Road, Thevara", 9.9380, 76.2970, "Thevara"),
    ("Shanmugham Road, Marine Drive", 9.9782, 76.2764, "Marine Drive"),
]

REALISTIC_COMPLAINTS = [
    # 1. Road damage (10 varied reports)
    (
        "road_damage",
        "Deep pothole outside St. Mary's School entrance",
        "Buses and scooters are swerving into oncoming traffic to avoid this two-foot hole that appeared after Monday's heavy rain.",
        "Inspected photos. Dispatched to Ward 14 road maintenance crew with cold-mix asphalt patch unit.",
        "Arrived with repair crew and safety cones. Excavated loose debris and applied hot bitumen binder.",
        "Pothole filled flush with road surface, compacted with mechanical roller, and opened to traffic.",
    ),
    (
        "road_damage",
        "Sunken trench after underground cable work",
        "The trench dug across the road for cabling has sunk about four inches. Vehicles bounce violently when crossing.",
        "Utility contractor notified. Municipal crew assigned to level trench with gravel base and asphalt.",
        "Excavated sinking soft mud. Compacted aggregate wet-mix base layer.",
        "Topped with 50mm asphalt wearing course and sealed joints with liquid emulsion.",
    ),
    (
        "road_damage",
        "Pothole cluster expanding near junction signal",
        "Three connected potholes right before the zebra crossing. Two-wheelers have skidded twice this morning.",
        "Road maintenance unit notified to repair cluster before peak evening traffic.",
        "Cleaned out dust and gravel from all three depressions. Applied tack coat adhesive.",
        "Filled with dense bituminous macadam and rolled compact. Pavement smooth.",
    ),
    (
        "road_damage",
        "Large trench left unpaved on newly surfaced road",
        "Water pipe repair was completed 10 days ago but the trench was only backfilled with loose mud which has now washed away.",
        "Notice issued to utility department. Permanent asphalt restoration scheduled.",
        "Excavated settling mud and placed 150mm wet mix macadam foundation.",
        "Surfaced with 40mm asphalt concrete and compacted flush with surrounding road.",
    ),
    (
        "road_damage",
        "Crumbling bitumen edge along canal road",
        "The asphalt along the road border is crumbling into the canal bank. Road width is shrinking.",
        "Civil engineering team assigned to construct stone pitching edge support.",
        "Built 12-meter dry rubble masonry toe wall along canal verge and filled edge with compacted gravel.",
        "Edge sealed with cold asphalt mix. Road shoulder stabilized.",
    ),
    (
        "road_damage",
        "Deep asphalt rutting near bus terminal exit",
        "Buses have created 3-inch deep ruts in the soft road surface, making steering hazardous for small cars.",
        "Road engineering unit scheduled night resurfacing to avoid transit disruption.",
        "Milled down 50mm of deformed asphalt surface using cold planer machine.",
        "Laid high-stability bituminous concrete and compacted with pneumatic roller.",
    ),
    (
        "road_damage",
        "Sharp edge crater near bridge approach ramp",
        "A deep crater has formed where the bridge expansion joint meets the asphalt. Cars brake abruptly on the incline.",
        "Bridge maintenance division alerted. Temporary steel road plate placed until night surfacing.",
        "Chiseled straight vertical edges around depression. Laid polymer-modified asphalt patch.",
        "Compacted with vibro-tamper and sealed expansion interface with mastic joint filler.",
    ),
    (
        "road_damage",
        "Loose asphalt gravel patch on hospital access road",
        "Previous patch has disintegrated into loose stones. Ambulances and two-wheelers slipping on the loose gravel curve.",
        "Priority civic corridor. Immediate cleaning and resurfacing order issued.",
        "Swept loose gravel off roadway. Applied rapid-setting bitumen emulsion bond coat.",
        "Laid 30mm dense asphalt concrete overlay. Surface broom-finished and fully stable.",
    ),
    (
        "road_damage",
        "Sunken road surface over telecom duct excavation",
        "A longitudinal dip has developed along the left lane for 15 meters where telecom cables were laid.",
        "Road inspection team took longitudinal profile measurements. Contractor penalized for poor backfill.",
        "Excavated poor sub-base. Refilled with graded crushed stone and compacted to 98% proctor density.",
        "Resurfaced with two lifts of hot-mix asphalt. Level aligned with adjacent lanes.",
    ),
    (
        "road_damage",
        "Series of interconnected potholes near vegetable market lane",
        "Heavy vegetable delivery lorries have broken down the road surface over a 25-meter stretch near the market entrance.",
        "Ward engineering team directed to carry out full-width sectional patch work.",
        "Milled damaged bitumen layer. Repaved entire 25-meter road width with heavy-duty mix.",
        "New pavement cured and marked with thermoplastic lane edge lines.",
    ),

    # 2. Garbage (10 varied reports)
    (
        "garbage",
        "Overflowing municipal waste bin near vegetable market",
        "Bin has been overflowing since Friday. Bags are piled on the pavement and stray animals are scattering waste across the road.",
        "Category confirmed. Forwarded to morning sanitation route for immediate mechanical clearance.",
        "Sanitation tipper on site. Cleared approximately 400 kg of mixed organic waste from sidewalk.",
        "Bin emptied, surrounding pavement swept, and lime powder applied for odor control.",
    ),
    (
        "garbage",
        "Commercial plastic crates and packaging dumped along footpath",
        "A large pile of plastic packaging and crates was left on the walkway overnight, blocking pedestrians.",
        "Solid waste enforcement officer assigned to document violation and arrange disposal.",
        "Loaded discarded plastic material into municipal cargo truck for sorting at recovery facility.",
        "Footpath cleared completely. Warning notice posted regarding illegal commercial dumping.",
    ),
    (
        "garbage",
        "Uncollected domestic garbage sacks on residential corner",
        "Collection truck missed the street on Wednesday. Sacks have started tearing open and attracting flies.",
        "Supervisor reprimanded route driver and arranged special afternoon collection sweep.",
        "Mini compactor truck arrived. All discarded bags loaded and sanitized.",
        "Corner fully cleaned and swept. Resident informed via status update.",
    ),
    (
        "garbage",
        "Fish market waste dumped in open municipal plot",
        "Rotten fish remains dumped in open ground causing severe stench and attracting stray birds.",
        "Health and sanitation team dispatched with disinfectant spray unit.",
        "Waste shoveled into bio-hazard disposal bags and transported to processing plant.",
        "Ground treated with heavy bleaching powder and citronella wash. Odor suppressed.",
    ),
    (
        "garbage",
        "Overflowing litter bin at public promenade",
        "Weekend visitors filled the bin and surrounding park bench area with bottles and snack wrappers.",
        "Promenade sanitation team assigned for evening clearance sweep.",
        "Emptied litter bins and manually picked all litter around benches and lawn area.",
        "Installed new heavy-gauge bin liner. Area clean and tidy.",
    ),
    (
        "garbage",
        "Illegal construction rubble blocking stormwater drain",
        "Bags of cement dust and tile pieces dumped into drainage channel, preventing storm run-off.",
        "Sanitation enforcement squad assigned with backhoe loader.",
        "Removed approximately 2 tons of construction debris from the stormwater channel.",
        "Drain channel cleared to original bed level. Stormwater flow unimpeded.",
    ),
    (
        "garbage",
        "Rotten vegetable mounds left behind night market stalls",
        "Decomposed cabbage and tomato heaps abandoned along the street curb after the Sunday weekly bazaar.",
        "Market sanitation team dispatched with compact loader and pressure washer.",
        "Shoveled organic matter onto tipper trailer. Disinfected curb with chlorinated wash.",
        "Street curb washed clean and sprayed with pine-oil deodorizer.",
    ),
    (
        "garbage",
        "Piled dry waste and discarded coconut shells near temple lane",
        "A huge mound of dried leaves, plastic cups, and coconut shells has accumulated near the lane entrance.",
        "Sanitation inspector scheduled green waste collection truck for immediate pickup.",
        "Collected dried organic matter for municipal composting facility. Separated plastics.",
        "Lane entrance cleared and swept clean. Dustbin placed at designated spot.",
    ),
    (
        "garbage",
        "Overflowing metal dumpster spilling onto two-wheeler parking",
        "The community skip is overflowing into the motorcycle parking bays, blocking 6 scooter slots.",
        "Sanitation logistics team arranged hook-lift truck to swap the full container with an empty one.",
        "Transported full 4.5 cubic meter container to Brahmapuram waste facility. Dropped clean container.",
        "Swept perimeter and disinfected tarmac around container pad.",
    ),
    (
        "garbage",
        "Plastic bottles and snack wrappers scattered along canal bank walkway",
        "Litter scattered over 50 meters along the pedestrian pathway following the local school festival.",
        "Area sweepers crew assigned with heavy-duty garbage bags and grab tools.",
        "Collected 8 large bags of dry recyclable plastic and paper waste.",
        "Pathway fully cleared and extra waste bins placed along the railing.",
    ),

    # 3. Waterlogging (10 varied reports)
    (
        "waterlogging",
        "Severe water pooling under railway underpass",
        "About a foot of water collected after the shower. Cars and auto-rickshaws are stalling trying to pass through.",
        "Monsoon drainage team alerted. Submersible pump truck deployed to clear blocked culvert.",
        "Positioned 5 HP dewatering pump at low point of underpass. Dislodged plastic debris from drain mouth.",
        "Water fully drained from underpass roadway. Catch basin grate cleared of silt and leaves.",
    ),
    (
        "waterlogging",
        "Stagnant stormwater accumulating near auto stand",
        "Water cannot drain into the covered culvert because the inlet grate is clogged with plastic wrappers and mud.",
        "Drainage clearance crew dispatched with hand rodding equipment.",
        "Removed iron grate and cleared heavy silt and polythene buildup from 20-meter culvert length.",
        "Grate reinstalled. Storm run-off flows freely into main storm sewer.",
    ),
    (
        "waterlogging",
        "Waterlogging near primary health centre entrance",
        "Pedestrians and patients cannot reach the entrance gate without stepping into ankle-deep puddle.",
        "Drainage division directed to clear roadside drain run-off channel.",
        "Excavated shallow trench connecting puddle to existing storm sewer box.",
        "Water drained completely. Applied gravel topping to prevent future water stagnation.",
    ),
    (
        "waterlogging",
        "Water pooling on bus bay stopping area",
        "Stormwater does not reach the roadside gully. Commuters waiting for buses are splashed by passing traffic.",
        "Road gradient inspection conducted. Small relief gully cut into concrete curb.",
        "Chiseled 100mm drainage channel in curb stone leading into stormwater drain.",
        "Pool drained into storm drain. Bus bay dry and accessible.",
    ),
    (
        "waterlogging",
        "Clogged stormwater inlet causing sidewalk flooding",
        "Dry leaves and silt have completely sealed the gutter inlet, water overflowing onto footway.",
        "Maintenance crew dispatched with high-pressure water jetting unit.",
        "Jet-washed 30 meters of stormwater pipe and scooped out compacted silt bucket-by-bucket.",
        "Inlet free-flowing. Sidewalk cleared of mud and puddle.",
    ),
    (
        "waterlogging",
        "Ponding water at school zebra crossing",
        "Children crossing have to walk through 3 inches of dirty water because the road level dips before the drain.",
        "Priority civic issue. Directed road division to install slotted drain channel.",
        "Installed 6-meter galvanized slotted channel flush with pedestrian crossing surface.",
        "Connected channel to adjacent catchpit. Crossing dry immediately after rainfall.",
    ),
    (
        "waterlogging",
        "Ankle-deep rain runoff accumulating outside post office gate",
        "Rainwater backs up across the whole entry driveway because the roadside culvert has silted up.",
        "Drainage team dispatched with suction hose truck.",
        "De-silted culvert barrel using vacuum suction unit. Removed three wheelbarrows of packed sediment.",
        "Driveway water drained into culvert. Post office entrance clear and accessible.",
    ),
    (
        "waterlogging",
        "Water stagnating across westbound lane near traffic signal",
        "Vehicles are forced into a single lane due to a 20-meter stretch of standing water after light showers.",
        "Highway division alerted to clear blocked kerb-side drain outlets.",
        "Unclogged three curb inlets with sewer rodding machine. Cleared roots and sand.",
        "Water dissipated into storm network. Both lanes fully operational.",
    ),
    (
        "waterlogging",
        "Blocked curb chute causing road pool near pharmacy row",
        "Puddle spreads 3 meters into the roadway, drenching shoppers when vehicles pass.",
        "Ward maintenance team assigned to open and widen curb drain chute.",
        "Reamed out curb opening and relined outlet with smooth cement mortar.",
        "Puddle drained into main drain line within 10 minutes.",
    ),
    (
        "waterlogging",
        "Sheet water pooling at culvert bottleneck on residential crossroad",
        "Storm run-off from higher elevation ponds at the intersection because the pipe diameter narrows.",
        "Drainage division inspected cross-pipe. Scheduled pipe enlargement.",
        "Excavated bottleneck section and replaced 300mm pipe with 600mm reinforced concrete pipe.",
        "Backfilled and sealed. Intersection drains rapidly even during cloudbursts.",
    ),

    # 4. Manhole or open drain (10 varied reports)
    (
        "open_drain",
        "Cracked slab over roadside storm drain",
        "The concrete slab over the drain has broken in the middle. Someone walking in the dark could easily fall through.",
        "High safety risk. Placed warning reflective barricades and requisitioned pre-cast concrete cover.",
        "Removed cracked slab sections. Fitted steel-reinforced concrete cover slab securely over drain channel.",
        "New slab seated flush with walkway. Warning barriers removed.",
    ),
    (
        "open_drain",
        "Iron manhole cover rattling loudly and rocking under vehicle wheels",
        "The round cover does not sit flush in its frame. Every passing truck causes a loud bang and it could flip over.",
        "Priority safety hazard. Crew sent to seat frame with bitumen mortar packing.",
        "Lifted manhole lid. Chipped out crumbled concrete bedding and reset frame with quick-setting resin.",
        "Lid seated firm and flush. Tested with municipal truck wheel crossing with zero movement or noise.",
    ),
    (
        "open_drain",
        "Broken drain grating on pedestrian footpath",
        "Iron bar on the stormwater grate is missing, leaving a gap wide enough for a child's foot to get trapped.",
        "Notified metal fabrication unit to prepare replacement steel grating.",
        "Removed damaged grate. Fitted newly welded mild steel safety grate with 20mm bar spacing.",
        "Grate anchored to concrete drain kerb. Walkway safe for pedestrians.",
    ),
    (
        "open_drain",
        "Missing round manhole cover near vegetable stall",
        "Drain opening is completely uncovered. Locals put a wooden plank over it as a temporary warning.",
        "Emergency safety dispatch. Heavy-duty ductile iron cover dispatched from central warehouse.",
        "Removed temporary wooden plank. Placed new 600mm Class D400 manhole lid into existing frame.",
        "Lid seated and locked into frame. Road reopened without hazard.",
    ),
    (
        "open_drain",
        "Broken concrete culvert cover outside residential gate",
        "Delivery vans have cracked the culvert slab. It is sagging and about to collapse.",
        "Assigned to ward civil works for precast slab replacement.",
        "Removed broken pieces with breaker. Placed heavy-duty precast RCC slab across drain span.",
        "Joints sealed with cement mortar. Vehicle access over culvert restored.",
    ),
    (
        "open_drain",
        "Manhole frame sunk 2 inches below newly laid tarmac",
        "Road was resurfaced last week but manhole was not raised to grade, leaving a sharp rim drop.",
        "Road contractor summoned to raise frame using riser ring.",
        "Saw-cut square perimeter around frame. Installed 50mm cast iron extension riser ring.",
        "Tamped asphalt around rim flush with road level. Ride quality smooth.",
    ),
    (
        "open_drain",
        "Missing rectangular storm drain grate near dispensary corner",
        "The steel grate was broken during ditch cleaning and removed, leaving a 3-foot wide open hole.",
        "Urgent pedestrian hazard near clinic entrance. Guard cones placed immediately.",
        "Fabricated custom 900x450mm ductile iron grating with anti-theft internal locking hinge.",
        "Installed locked grate into chamber collar. Walkway restored to safe condition.",
    ),
    (
        "open_drain",
        "Cracked reinforced cement manhole cover sagging on sidewalk",
        "Heavy vehicle parked on sidewalk has fractured the circular concrete manhole lid.",
        "Ward inspection confirmed structural failure. Barricaded immediately.",
        "Chipped away broken lid fragments. Replaced with heavy-duty cast iron inspection cover.",
        "Chamber rim mortared and flush with sidewalk tiles.",
    ),
    (
        "open_drain",
        "Dislodged cast iron sewer lid sitting askew on busy corner",
        "The lid has slipped out of its rebate ring and is tilted at 45 degrees, exposing half the dark sewer shaft.",
        "Emergency response crew sent with crowbars and safety harness.",
        "Cleared gravel and tar chips from frame seating groove. Levered lid back into full flush lock.",
        "Checked lid seating stability under vehicular tire pass.",
    ),
    (
        "open_drain",
        "Open roadside gully pit missing protective grating near bus stop",
        "The square stormwater gully pit next to the shelter bench has no grating or barrier whatsoever.",
        "Public transit passenger hazard. Immediate barricade and fabrication order.",
        "Anchored new galvanised hinged gully grate into masonry frame using heavy expansion bolts.",
        "Gully protected. Rain runoff flows freely while preventing any foot fall.",
    ),
]


def generate_sample_image(text_label: str, color_theme: tuple[int, int, int]) -> bytes:
    """Creates a crisp, lightweight demo image with street service markings."""
    width, height = 800, 600
    img = Image.new("RGB", (width, height), color=color_theme)
    draw = ImageDraw.Draw(img)

    # Decorative municipal grid pattern
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=(color_theme[0] + 15, color_theme[1] + 15, color_theme[2] + 15), width=1)
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=(color_theme[0] + 15, color_theme[1] + 15, color_theme[2] + 15), width=1)

    # Road / Ground shape
    draw.rectangle([60, 100, width - 60, height - 100], fill=(50, 55, 65))
    draw.rectangle([80, 120, width - 80, height - 120], fill=(70, 75, 85))

    # Center label box
    draw.rectangle([180, 240, width - 180, 360], fill=(255, 255, 255))
    draw.text((220, 280), f"PHOTO EVIDENCE: {text_label.upper()}", fill=(20, 30, 45))
    draw.text((220, 310), f"Recorded by Resident Verification System", fill=(100, 110, 120))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def seed():
    settings = get_settings()
    now = datetime.now(UTC)
    storage = get_storage()
    reset_mode = "--reset" in sys.argv or "--reset-all" in sys.argv
    reset_all = "--reset-all" in sys.argv

    with SessionLocal() as db:
        if reset_mode:
            print("Reset mode requested: cleaning up old demo/mock complaints and duplicate categories...")
            # 1. Merge legacy duplicate categories into standard review deck categories
            db.query(Complaint).filter(Complaint.category.in_(["manhole", "open_or_broken_manhole"])).update({"category": "open_drain"}, synchronize_session=False)
            db.query(Complaint).filter(Complaint.category.in_(["street_lighting", "street_light_outage"])).update({"category": "street_light"}, synchronize_session=False)

            legacy_cats = db.scalars(
                select(CategoryRecord).where(CategoryRecord.code.in_(["manhole", "street_lighting", "street_light_outage", "open_or_broken_manhole"]))
            ).all()
            for lc in legacy_cats:
                db.delete(lc)

            # 2. Identify demo complaints and remove non-Kochi legacy rows
            non_kochi_terms = ["chennai", "bengaluru", "valavoor", "halasuru", "avenue road", "koramangala", "malleshwaram", "bellandur", "city market"]
            all_comps = db.scalars(select(Complaint)).all()
            for c in all_comps:
                is_demo = (
                    c.tracking_id.startswith("GG-2026-H") or
                    c.tracking_id.startswith("GG-2026-RD") or
                    c.tracking_id.startswith("GG-2026-GB") or
                    c.tracking_id.startswith("GG-2026-WL") or
                    c.tracking_id.startswith("GG-2026-MH") or
                    c.tracking_id.startswith("GG-2026-SL") or
                    any(term in (c.location_text or "").lower() for term in non_kochi_terms) or
                    reset_all
                )
                if is_demo:
                    db.query(IncidentClusterMember).filter(IncidentClusterMember.report_id == c.id).delete(synchronize_session=False)
                    ev_ids = [e[0] for e in db.query(Evidence.id).filter(Evidence.complaint_id == c.id).all()]
                    if ev_ids:
                        db.query(PhotoSignal).filter(PhotoSignal.evidence_id.in_(ev_ids)).delete(synchronize_session=False)
                    db.query(EscalationEvent).filter(EscalationEvent.report_id == c.id).delete(synchronize_session=False)
                    db.query(IncidentLink).filter((IncidentLink.report_id_1 == c.id) | (IncidentLink.report_id_2 == c.id)).delete(synchronize_session=False)
                    pred_ids = [p[0] for p in db.query(MLPrediction.id).filter(MLPrediction.report_id == c.id).all()]
                    if pred_ids:
                        db.query(MLFeedback).filter(MLFeedback.prediction_id.in_(pred_ids)).delete(synchronize_session=False)
                    db.query(MLPrediction).filter(MLPrediction.report_id == c.id).delete(synchronize_session=False)
                    db.query(StatusEvent).filter(StatusEvent.complaint_id == c.id).delete(synchronize_session=False)
                    db.query(Assignment).filter(Assignment.complaint_id == c.id).delete(synchronize_session=False)
                    db.query(Evidence).filter(Evidence.complaint_id == c.id).delete(synchronize_session=False)
                    db.delete(c)
            db.commit()
            print("Cleanup completed.")

        print("1. Seeding Teams...")
        team_map: dict[str, Team] = {}
        for t_data in DEMO_TEAMS:
            team = db.scalar(select(Team).where(Team.name == t_data["name"]))
            if not team:
                team = Team(
                    id=str(uuid.uuid4()),
                    name=t_data["name"],
                    description=t_data["description"],
                    jurisdiction_id=settings.jurisdiction_id,
                    created_at=now - timedelta(days=90),
                )
                db.add(team)
            team_map[t_data["name"]] = team
        db.flush()

        print("2. Seeding Categories...")
        for c_data in DEMO_CATEGORIES:
            cat = db.scalar(select(CategoryRecord).where(CategoryRecord.code == c_data["code"]))
            def_team = team_map.get(c_data["team_name"])
            if not cat:
                cat = CategoryRecord(
                    id=str(uuid.uuid4()),
                    code=c_data["code"],
                    label=c_data["label"],
                    description=c_data["description"],
                    target_hours=c_data["target_hours"],
                    first_response_hours=c_data.get("first_response_hours", 24),
                    fix_hours=c_data.get("fix_hours", c_data["target_hours"]),
                    escalate_after_hours=c_data.get("escalate_after_hours", 24),
                    icon=c_data["icon"],
                    sort_order=c_data.get("sort_order", 10),
                    photo_rule=c_data.get("photo_rule", "required"),
                    active=c_data.get("active", True),
                    default_team_id=def_team.id if def_team else None,
                    created_at=now - timedelta(days=90),
                )
                db.add(cat)
            else:
                cat.label = c_data["label"]
                cat.description = c_data["description"]
                cat.target_hours = c_data["target_hours"]
                cat.first_response_hours = c_data.get("first_response_hours", 24)
                cat.fix_hours = c_data.get("fix_hours", c_data["target_hours"])
                cat.escalate_after_hours = c_data.get("escalate_after_hours", 24)
                cat.icon = c_data["icon"]
                cat.sort_order = c_data.get("sort_order", 10)
                cat.photo_rule = c_data.get("photo_rule", "required")
                cat.active = c_data.get("active", True)
                if def_team:
                    cat.default_team_id = def_team.id
        db.flush()

        print("3. Seeding Users...")
        user_map: dict[str, User] = {}
        for u_data in DEMO_USERS:
            user = db.scalar(select(User).where(User.email == u_data["email"]))
            team = team_map.get(u_data["team"]) if u_data["team"] else None
            pw_hash = password_hasher.hash(u_data["password"])
            if not user:
                user = User(
                    id=str(uuid.uuid4()),
                    email=u_data["email"],
                    name=u_data["name"],
                    phone=u_data["phone"],
                    role=u_data["role"],
                    team_id=team.id if team else None,
                    jurisdiction_id=settings.jurisdiction_id,
                    password_hash=pw_hash,
                    status="active",
                    active=True,
                    email_verified=True,
                    created_at=now - timedelta(days=90),
                    last_active_at=now - timedelta(minutes=random.randint(5, 120)),
                )
                db.add(user)
            else:
                user.name = u_data["name"]
                user.phone = u_data["phone"]
                user.role = u_data["role"]
                user.password_hash = pw_hash
                user.status = "active"
                user.active = True
                user.email_verified = True
                if team:
                    user.team_id = team.id
            user_map[u_data["email"]] = user
        db.flush()

        citizen = user_map["citizen@grievancegrid.test"]
        officer = user_map["officer@grievancegrid.test"]
        field_worker = user_map["field@grievancegrid.test"]

        print("4. Seeding Core Seed Complaints with Real Photos...")
        core_reports = [
            {
                "tracking_id": "GG-2026-RD01A",
                "category": "road_damage",
                "title": "Deep pothole causing traffic slowdown and hazard",
                "description": "Large cavity approx 1.5m wide near the bus stop curb. Multiple two-wheelers have lost balance. Pavement asphalt eroded.",
                "location_text": "KB Jacob Road, Fort Kochi",
                "area_name": "Fort Kochi",
                "latitude": 9.9658,
                "longitude": 76.2422,
                "status": ComplaintStatus.IN_PROGRESS,
                "days_ago": 3,
                "photo_theme": (80, 70, 60),
                "photo_label": "Road Damage Pothole",
            },
            {
                "tracking_id": "GG-2026-GB02B",
                "category": "garbage",
                "title": "Overflowing public dumpster blocking pedestrian walkway",
                "description": "Secondary waste collection point has not been cleared for 3 days. Spillover blocking sidewalk and emitting foul odor.",
                "location_text": "Shanmugham Road, Marine Drive",
                "area_name": "Marine Drive",
                "latitude": 9.9782,
                "longitude": 76.2764,
                "status": ComplaintStatus.UNDER_REVIEW,
                "days_ago": 2,
                "photo_theme": (60, 80, 60),
                "photo_label": "Waste Dumpster Overflow",
            },
            {
                "tracking_id": "GG-2026-WL03C",
                "category": "waterlogging",
                "title": "Severe road waterlogging following afternoon storm",
                "description": "Storm drain inlet blocked by leaves and silt. 8 to 10 inches of standing water across both westbound lanes.",
                "location_text": "Toll Junction, Edappally",
                "area_name": "Edappally",
                "latitude": 10.0248,
                "longitude": 76.3082,
                "status": ComplaintStatus.SUBMITTED,
                "days_ago": 1,
                "photo_theme": (50, 70, 90),
                "photo_label": "Flooded Roadway",
            },
            {
                "tracking_id": "GG-2026-MH04D",
                "category": "open_drain",
                "title": "Missing storm drain manhole cover on cycle track",
                "description": "Cast iron circular lid dislodged and missing. Hazardous open aperture directly in path of pedestrians and cyclists.",
                "location_text": "Kaloor-Kadavanthra Road, Kaloor",
                "area_name": "Kaloor",
                "latitude": 9.9950,
                "longitude": 76.2940,
                "status": ComplaintStatus.RESOLVED,
                "days_ago": 6,
                "photo_theme": (70, 60, 70),
                "photo_label": "Open Manhole Cover",
            },
            {
                "tracking_id": "GG-2026-MH05E",
                "category": "open_drain",
                "title": "Damaged concrete manhole collar near corner",
                "description": "The circular cement collar around the roadside manhole has crumbled, leaving jagged exposed concrete.",
                "location_text": "Main Avenue, Panampilly Nagar",
                "area_name": "Panampilly Nagar",
                "latitude": 9.9610,
                "longitude": 76.2930,
                "status": ComplaintStatus.IN_PROGRESS,
                "days_ago": 5,
                "photo_theme": (70, 60, 70),
                "photo_label": "Broken Manhole Ring",
            },
        ]

        for rep in core_reports:
            complaint = db.scalar(select(Complaint).where(Complaint.tracking_id == rep["tracking_id"]))
            rec_time = now - timedelta(days=rep["days_ago"])
            
            payload = {
                "title": rep["title"],
                "description": rep["description"],
                "category": rep["category"],
                "latitude": rep["latitude"],
                "longitude": rep["longitude"],
                "location_text": rep["location_text"],
                "client_request_id": f"seed-{rep['tracking_id']}",
            }
            req_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

            if not complaint:
                complaint = Complaint(
                    id=str(uuid.uuid4()),
                    tracking_id=rep["tracking_id"],
                    citizen_id=citizen.id,
                    client_request_id=f"seed-{rep['tracking_id']}",
                    request_hash=req_hash,
                    jurisdiction_id=settings.jurisdiction_id,
                    title=rep["title"],
                    description=rep["description"],
                    category=rep["category"],
                    latitude=rep["latitude"],
                    longitude=rep["longitude"],
                    location_text=rep["location_text"],
                    area_name=rep.get("area_name"),
                    location_source="device",
                    status=rep["status"],
                    version=2 if rep["status"] != ComplaintStatus.SUBMITTED else 1,
                    received_at=rec_time,
                    updated_at=rec_time + timedelta(hours=8),
                )
                db.add(complaint)
                db.flush()

                # Add timeline events
                db.add(StatusEvent(
                    id=str(uuid.uuid4()),
                    complaint_id=complaint.id,
                    actor_id=citizen.id,
                    status=ComplaintStatus.SUBMITTED.value,
                    note="Problem reported by resident with on-site photo.",
                    created_at=rec_time,
                ))
                if rep["status"] in (ComplaintStatus.UNDER_REVIEW, ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED):
                    db.add(StatusEvent(
                        id=str(uuid.uuid4()),
                        complaint_id=complaint.id,
                        actor_id=officer.id,
                        status=ComplaintStatus.UNDER_REVIEW.value,
                        note="Reviewed by Ward Operations Officer. Assigned to field crew.",
                        created_at=rec_time + timedelta(hours=6),
                    ))
                if rep["status"] in (ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED):
                    db.add(StatusEvent(
                        id=str(uuid.uuid4()),
                        complaint_id=complaint.id,
                        actor_id=field_worker.id,
                        status=ComplaintStatus.IN_PROGRESS.value,
                        note="Work started on site by maintenance team.",
                        created_at=rec_time + timedelta(hours=14),
                    ))
                if rep["status"] == ComplaintStatus.RESOLVED:
                    db.add(StatusEvent(
                        id=str(uuid.uuid4()),
                        complaint_id=complaint.id,
                        actor_id=officer.id,
                        status=ComplaintStatus.RESOLVED.value,
                        note="Inspection verified complete. Pavement flush and secure.",
                        created_at=rec_time + timedelta(hours=48),
                    ))
            else:
                complaint.area_name = rep.get("area_name")

            # Seed photo evidence
            def safe_put(key, data, m_type):
                try:
                    storage.put(key, data, m_type)
                except (FileExistsError, Exception):
                    pass

            ev_count = db.scalar(select(func.count(Evidence.id)).where(Evidence.complaint_id == complaint.id)) or 0
            if ev_count == 0:
                if rep["tracking_id"] == "GG-2026-MH04D":
                    # Seed before photo
                    storage_key_b = f"evidence/{complaint.id}/photo_before.jpg"
                    img_data_b = generate_sample_image("Before repair: open drain aperture", (90, 50, 50))
                    safe_put(storage_key_b, img_data_b, "image/jpeg")
                    thumb_key_b = f"{storage_key_b}_thumb.webp"
                    safe_put(thumb_key_b, img_data_b, "image/webp")
                    display_key_b = f"{storage_key_b}_display.webp"
                    safe_put(display_key_b, img_data_b, "image/webp")

                    db.add(Evidence(
                        id=str(uuid.uuid4()),
                        complaint_id=complaint.id,
                        object_key=storage_key_b,
                        thumbnail_key=thumb_key_b,
                        display_key=display_key_b,
                        phase="before",
                        processed=True,
                        media_type="image/jpeg",
                        size_bytes=len(img_data_b),
                        sha256=hashlib.sha256(img_data_b).hexdigest(),
                        uploaded_at=rec_time + timedelta(hours=14),
                        taken_at=rec_time + timedelta(hours=14),
                    ))

                    # Seed after photo
                    storage_key_a = f"evidence/{complaint.id}/photo_after.jpg"
                    img_data_a = generate_sample_image("After repair: flush steel grate installed", (40, 80, 50))
                    safe_put(storage_key_a, img_data_a, "image/jpeg")
                    thumb_key_a = f"{storage_key_a}_thumb.webp"
                    safe_put(thumb_key_a, img_data_a, "image/webp")
                    display_key_a = f"{storage_key_a}_display.webp"
                    safe_put(display_key_a, img_data_a, "image/webp")

                    db.add(Evidence(
                        id=str(uuid.uuid4()),
                        complaint_id=complaint.id,
                        object_key=storage_key_a,
                        thumbnail_key=thumb_key_a,
                        display_key=display_key_a,
                        phase="after",
                        processed=True,
                        media_type="image/jpeg",
                        size_bytes=len(img_data_a),
                        sha256=hashlib.sha256(img_data_a).hexdigest(),
                        uploaded_at=rec_time + timedelta(hours=48),
                        taken_at=rec_time + timedelta(hours=48),
                    ))
                else:
                    storage_key = f"evidence/{complaint.id}/photo_main.jpg"
                    img_data = generate_sample_image(rep["photo_label"], rep["photo_theme"])
                    safe_put(storage_key, img_data, "image/jpeg")

                    thumb_data = generate_sample_image(f"Thumb: {rep['photo_label']}", rep["photo_theme"])
                    thumb_key = f"{storage_key}_thumb.webp"
                    safe_put(thumb_key, thumb_data, "image/webp")

                    display_data = generate_sample_image(f"Display: {rep['photo_label']}", rep["photo_theme"])
                    display_key = f"{storage_key}_display.webp"
                    safe_put(display_key, display_data, "image/webp")

                    evidence = Evidence(
                        id=str(uuid.uuid4()),
                        complaint_id=complaint.id,
                        object_key=storage_key,
                        thumbnail_key=thumb_key,
                        display_key=display_key,
                        phase="report",
                        processed=True,
                        media_type="image/jpeg",
                        size_bytes=len(img_data),
                        sha256=hashlib.sha256(img_data).hexdigest(),
                        uploaded_at=rec_time,
                        taken_at=rec_time,
                    )
                    db.add(evidence)

            # Seed field assignment if under review or in progress
            if rep["status"] in (ComplaintStatus.UNDER_REVIEW, ComplaintStatus.IN_PROGRESS):
                assign_check = db.scalar(select(Assignment).where(Assignment.complaint_id == complaint.id))
                if not assign_check:
                    db.add(Assignment(
                        id=str(uuid.uuid4()),
                        complaint_id=complaint.id,
                        assigned_by_id=officer.id,
                        assigned_to_id=field_worker.id,
                        team_id=field_worker.team_id,
                        status="in_progress" if rep["status"] == ComplaintStatus.IN_PROGRESS else "assigned",
                        notes="Priority road segment. Complete repair within 48h.",
                        assigned_at=rec_time + timedelta(hours=6),
                    ))

        print("5. Seeding 90-day Analytics Spread for Senior Dashboard...")
        all_count = len(list(db.scalars(select(Complaint.id)).all()))
        if reset_mode or all_count < 45:
            cat_list = ["road_damage", "garbage", "waterlogging", "open_drain"]
            # Team mapping for assignments
            cat_team_map = {
                "road_damage": team_map.get("Roads & Pavements"),
                "garbage": team_map.get("Sanitation & Waste"),
                "waterlogging": team_map.get("Drainage & Stormwater"),
                "open_drain": team_map.get("Drainage & Stormwater"),
            }
            workers_list = [u for u in user_map.values() if u.role == Role.FIELD_OFFICER]

            for i, item in enumerate(REALISTIC_COMPLAINTS, start=1):
                cat_code, r_title, r_desc, off_note, fw_note, res_note = item
                days_back = random.randint(1, 89)
                rec_at = now - timedelta(days=days_back, hours=random.randint(1, 23))
                loc_name, lat, lng, ward = HOTSPOTS[(i - 1) % len(HOTSPOTS)]
                
                # Determine realistic status and completion
                if days_back > 14:
                    rep_status = ComplaintStatus.RESOLVED if random.random() < 0.75 else ComplaintStatus.IN_PROGRESS
                elif days_back > 5:
                    rep_status = random.choice([ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED, ComplaintStatus.UNDER_REVIEW])
                else:
                    rep_status = random.choice([ComplaintStatus.SUBMITTED, ComplaintStatus.UNDER_REVIEW, ComplaintStatus.IN_PROGRESS])

                gen_tracking = f"GG-2026-H{i:03d}X"
                res_hours = random.choice([16, 20, 24, 36, 40, 72, 96, 120])

                c_item = Complaint(
                    id=str(uuid.uuid4()),
                    tracking_id=gen_tracking,
                    citizen_id=citizen.id,
                    client_request_id=f"history-{i}",
                    request_hash=hashlib.sha256(f"history-{i}".encode()).hexdigest(),
                    jurisdiction_id=settings.jurisdiction_id,
                    title=r_title,
                    description=f"{r_desc} Observed at {loc_name}.",
                    category=cat_code,
                    latitude=lat + random.uniform(-0.003, 0.003),
                    longitude=lng + random.uniform(-0.003, 0.003),
                    location_text=loc_name,
                    area_name=ward,
                    location_source="manual",
                    status=rep_status,
                    version=2 if rep_status != ComplaintStatus.SUBMITTED else 1,
                    received_at=rec_at,
                    updated_at=rec_at + timedelta(hours=res_hours if rep_status == ComplaintStatus.RESOLVED else random.randint(4, 24)),
                )
                db.add(c_item)
                db.flush()

                # Add initial submitted event
                db.add(StatusEvent(
                    id=str(uuid.uuid4()),
                    complaint_id=c_item.id,
                    actor_id=citizen.id,
                    status=ComplaintStatus.SUBMITTED.value,
                    note="Resident submitted issue report with description and location.",
                    created_at=rec_at,
                ))

                assigned_team = cat_team_map.get(cat_code)
                team_worker = next((w for w in workers_list if w.team_id == (assigned_team.id if assigned_team else None)), field_worker)

                if rep_status in (ComplaintStatus.UNDER_REVIEW, ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED):
                    db.add(StatusEvent(
                        id=str(uuid.uuid4()),
                        complaint_id=c_item.id,
                        actor_id=officer.id,
                        status=ComplaintStatus.UNDER_REVIEW.value,
                        note=off_note,
                        created_at=rec_at + timedelta(hours=6),
                    ))
                    # Assignment
                    db.add(Assignment(
                        id=str(uuid.uuid4()),
                        complaint_id=c_item.id,
                        assigned_by_id=officer.id,
                        assigned_to_id=team_worker.id,
                        team_id=assigned_team.id if assigned_team else team_worker.team_id,
                        status="completed" if rep_status == ComplaintStatus.RESOLVED else "in_progress",
                        notes=f"Maintenance job for {r_title} in {ward}.",
                        assigned_at=rec_at + timedelta(hours=6),
                        completed_at=rec_at + timedelta(hours=res_hours) if rep_status == ComplaintStatus.RESOLVED else None,
                    ))

                if rep_status in (ComplaintStatus.IN_PROGRESS, ComplaintStatus.RESOLVED):
                    db.add(StatusEvent(
                        id=str(uuid.uuid4()),
                        complaint_id=c_item.id,
                        actor_id=team_worker.id,
                        status=ComplaintStatus.IN_PROGRESS.value,
                        note=fw_note,
                        created_at=rec_at + timedelta(hours=12),
                    ))
                if rep_status == ComplaintStatus.RESOLVED:
                    db.add(StatusEvent(
                        id=str(uuid.uuid4()),
                        complaint_id=c_item.id,
                        actor_id=officer.id,
                        status=ComplaintStatus.RESOLVED.value,
                        note=res_note,
                        created_at=rec_at + timedelta(hours=res_hours),
                    ))

        db.commit()

        print("6. Backfilling notification activity...")
        n_count = backfill_notifications(db)
        print(f"Backfilled {n_count} notifications.")

        print("7. Seeding System Settings, ML Suggestions, Feedback, and Photo Signals...")
        admin = user_map.get("admin@grievancegrid.test")
        admin_id = admin.id if admin else None

        default_settings = {
            "area_name": "Kochi",
            "emergency_number": "112",
            "default_target_hours": 48,
            "warn_before_due_hours": 24,
            "email_sender_name": "Kochi Municipal Corporation",
            "email_report_updates": True,
            "email_new_jobs": True,
            "email_invites": True,
            "photo_check_enabled": True,
            "duplicate_match_enabled": True,
            "priority_suggestion_enabled": True,
            "citizen_photo_hint_enabled": True,
            "photo_authenticity_enabled": True,
            "senior_alert_popup_enabled": True,
        }
        for k, v in default_settings.items():
            db.merge(SystemSetting(
                key=k,
                value=json.dumps(v),
                updated_at=now,
                updated_by_id=admin_id,
            ))

        # Pre-fetch evidence IDs map
        recent_complaints = list(db.scalars(
            select(Complaint)
            .where(Complaint.received_at >= now - timedelta(days=30))
            .order_by(Complaint.received_at.desc())
        ))

        all_evidence = list(db.scalars(select(Evidence)))
        comp_ev_map: dict[str, list[Evidence]] = {}
        for ev in all_evidence:
            comp_ev_map.setdefault(ev.complaint_id, []).append(ev)

        pred_count = 0
        feedback_count = 0
        feedbacks_to_add = []
        signals_to_add = []

        for c in recent_complaints[:25]:
            evs = comp_ev_map.get(c.id, [])
            ev_id = evs[0].id if evs else None

            # 1. Photo check suggestion
            pred_id = str(uuid.uuid4())
            db.add(MLPrediction(
                id=pred_id,
                kind="photo_check",
                report_id=c.id,
                photo_id=ev_id,
                model_name="efficientnet_b0_ensemble",
                model_version="v1.0",
                output_json=json.dumps({
                    "primary_suggestion": c.category,
                    "models_available": True,
                    "relevance_hint": f"Photo shows features consistent with {c.category.replace('_', ' ')}.",
                }),
                created_at=c.received_at + timedelta(minutes=5),
            ))
            pred_count += 1

            choice = "right" if random.random() < 0.85 else "wrong"
            feedbacks_to_add.append(MLFeedback(
                id=str(uuid.uuid4()),
                prediction_id=pred_id,
                user_id=officer.id,
                feedback_choice=choice,
                created_at=c.received_at + timedelta(hours=2),
            ))
            feedback_count += 1

            # 2. Priority suggestion
            pred_prio_id = str(uuid.uuid4())
            is_urgent = c.category in ("manhole", "waterlogging")
            db.add(MLPrediction(
                id=pred_prio_id,
                kind="priority_suggestion",
                report_id=c.id,
                photo_id=None,
                model_name="rule_rubric_v1",
                model_version="v1.0",
                output_json=json.dumps({
                    "priority": "HIGH" if is_urgent else "MEDIUM",
                    "target_hours": 24 if is_urgent else 48,
                    "why_this_order": [
                        "Baseline hazard rules for pedestrian and traffic risk"
                    ],
                }),
                created_at=c.received_at + timedelta(minutes=6),
            ))
            pred_count += 1

            if random.random() < 0.8:
                feedbacks_to_add.append(MLFeedback(
                    id=str(uuid.uuid4()),
                    prediction_id=pred_prio_id,
                    user_id=officer.id,
                    feedback_choice="right",
                    created_at=c.received_at + timedelta(hours=3),
                ))
                feedback_count += 1

            # 3. Duplicate match
            pred_dup_id = str(uuid.uuid4())
            db.add(MLPrediction(
                id=pred_dup_id,
                kind="duplicate_match",
                report_id=c.id,
                photo_id=None,
                model_name="minilm_strategy2",
                model_version="v1.0",
                output_json=json.dumps([]),
                created_at=c.received_at + timedelta(minutes=7),
            ))
            pred_count += 1

            # 4. Photo authenticity
            if ev_id:
                pred_auth_id = str(uuid.uuid4())
                db.add(MLPrediction(
                    id=pred_auth_id,
                    kind="photo_authenticity",
                    report_id=c.id,
                    photo_id=ev_id,
                    model_name="authenticity_signals_v1",
                    model_version="v1.0",
                    output_json=json.dumps({
                        "level": "none",
                        "reasons": [],
                        "flags": [],
                    }),
                    created_at=c.received_at + timedelta(minutes=8),
                ))
                pred_count += 1

                signals_to_add.append(PhotoSignal(
                    id=str(uuid.uuid4()),
                    evidence_id=ev_id,
                    complaint_id=c.id,
                    has_c2pa=False,
                    software_tag=None,
                    has_camera_metadata=True,
                    camera_make="Samsung",
                    camera_model="Galaxy S21",
                    capture_time=c.received_at,
                    time_flag=None,
                    distance_meters=80.0,
                    place_flag=None,
                    dimensions="1920x1080",
                    dimension_flag=False,
                    authenticity_level="none",
                    reasons_json=json.dumps([]),
                    created_at=c.received_at + timedelta(minutes=5),
                ))

        # Flush predictions first so foreign keys exist
        db.flush()

        for fb in feedbacks_to_add:
            db.add(fb)
        for sig in signals_to_add:
            db.add(sig)

        db.commit()
        print(f"Seeded {pred_count} ML predictions and {feedback_count} feedback records.")

        print("8. Seeding Incident Clusters in Kochi...")
        from app.ml.cluster_engine import rebuild_clusters
        rebuild_result = rebuild_clusters(db)
        print(f"Clustering complete: {rebuild_result}")

    print("Demo seeding complete. All test accounts, teams, categories, photos, clusters, and 90-day metrics ready.")


if __name__ == "__main__":
    seed()
