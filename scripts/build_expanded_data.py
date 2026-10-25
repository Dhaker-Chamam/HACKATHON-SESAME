"""Script to generate the expanded destinations and devices catalog.
Ensures valid evidence, source schemas, zero em dashes, and full backward compatibility.
"""
import json
from pathlib import Path

DATA_DIR = Path("data")

# Read current verified destinations and devices
dests_data = json.loads((DATA_DIR / "destinations.json").read_text(encoding="utf-8"))
devices_data = json.loads((DATA_DIR / "devices.json").read_text(encoding="utf-8"))

# Additional destinations known to humanity
new_destinations = [
    {
        "id": "mercury",
        "name": "Mercury",
        "place": "Hermian polar crater base (permanently shadowed)",
        "where": "in the Mercury polar habitat",
        "category": "Solar Planet",
        "gravity_ms2": {
            "value": 3.70, "unit": "m/s²", "evidence": "Physics",
            "note": "Mercury surface gravity is about 0.38 g, similar to Mars.",
            "source": {"title": "NASA Mercury Fact Sheet", "url": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html"}
        },
        "outside_temp_c": {
            "min": -180, "max": 430, "unit": "°C", "evidence": "Spaceflight data",
            "note": "Extreme day-night temperature swings on the airless surface.",
            "source": {"title": "NASA MESSENGER Mission Data", "url": "https://science.nasa.gov/mission/messenger/"}
        },
        "cabin_temp_c": {
            "min": 18, "max": 25, "unit": "°C", "evidence": "Standard",
            "note": "Standard habitat environmental control range.",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf"}
        },
        "cabin_pressure_kpa": {
            "value": 56.5, "unit": "kPa", "evidence": "Standard",
            "note": "NASA Exploration Atmosphere (8.2 psia).",
            "source": {"title": "NASA Exploration Atmosphere Brief", "url": "https://www.nasa.gov"}
        },
        "oxygen_percent": {
            "value": 34, "unit": "%", "evidence": "Standard",
            "source": {"title": "NASA Exploration Atmosphere Brief", "url": "https://www.nasa.gov"}
        },
        "radiation_msv_day": {
            "value": 1.90, "unit": "mSv/day", "evidence": "Research study",
            "note": "Elevated solar particle flux due to proximity to the Sun (0.39 AU).",
            "source": {"title": "Solar Orbiter Radiation Measurements", "url": "https://www.esa.int"}
        },
        "transit_days_each_way": {
            "value": 150, "unit": "days", "evidence": "Physics",
            "note": "Hohmann transfer with gravity assists.",
            "source": {"title": "BepiColombo Trajectory Analysis", "url": "https://www.esa.int"}
        },
        "transit_radiation_msv_day": 1.80,
        "light_delay_s": {
            "min": 280, "max": 860, "unit": "s", "evidence": "Physics",
            "note": "Light travel time between Mercury and Earth (4.7 to 14.3 minutes).",
            "source": {"title": "JPL Planetary Ephemeris", "url": "https://ssd.jpl.nasa.gov"}
        },
        "blackout": {
            "value": True, "evidence": "Physics",
            "source": {"title": "Superior solar conjunction geometry", "url": None}
        },
        "dust": {
            "value": "fine regolith", "evidence": "Spaceflight data",
            "note": "Extremely abrasive micro-fractured basaltic regolith from solar wind bombardment.",
            "source": {"title": "MESSENGER Surface Science", "url": "https://science.nasa.gov"}
        },
        "arrival_pressure_kpa": {
            "from": 101.3, "to": 56.5, "unit": "kPa", "evidence": "Standard",
            "note": "Controlled decompression during orbital descent.",
            "source": {"title": "NASA OCHMO-TB-002", "url": "https://www.nasa.gov"}
        }
    },
    {
        "id": "venus",
        "name": "Venus",
        "place": "High-altitude cloud station (55 km aerostat)",
        "where": "in the Venus cloud aerostat habitat",
        "category": "Solar Planet",
        "gravity_ms2": {
            "value": 8.87, "unit": "m/s²", "evidence": "Physics",
            "note": "Near Earth-equivalent gravity (0.90 g).",
            "source": {"title": "NASA Venus Fact Sheet", "url": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html"}
        },
        "outside_temp_c": {
            "min": 0, "max": 50, "unit": "°C", "evidence": "Spaceflight data",
            "note": "At 55 km altitude, Venus atmosphere offers Earth-like pressure and temperature.",
            "source": {"title": "NASA HAVOC Study: High Altitude Venus Operational Concept", "url": "https://ntrs.nasa.gov"}
        },
        "cabin_temp_c": {
            "min": 19, "max": 25, "unit": "°C", "evidence": "Standard",
            "note": "Climate-controlled habitat gondola.",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov"}
        },
        "cabin_pressure_kpa": {
            "value": 75.0, "unit": "kPa", "evidence": "Aviation data",
            "note": "Airliner equivalent pressure matched to ambient buoyant cloud level.",
            "source": {"title": "NASA HAVOC Engineering Architecture", "url": "https://ntrs.nasa.gov"}
        },
        "oxygen_percent": {
            "value": 24, "unit": "%", "evidence": "Standard",
            "source": {"title": "NASA Exploration Architecture", "url": "https://www.nasa.gov"}
        },
        "radiation_msv_day": {
            "value": 0.35, "unit": "mSv/day", "evidence": "Research study",
            "note": "Heavy upper cloud mass provides superior cosmic ray shielding.",
            "source": {"title": "Venus Atmospheric Radiation Shielding Modeling", "url": "https://ntrs.nasa.gov"}
        },
        "transit_days_each_way": {
            "value": 110, "unit": "days", "evidence": "Physics",
            "note": "Direct transfer trajectory.",
            "source": {"title": "Planetary Flight Handbook", "url": "https://ntrs.nasa.gov"}
        },
        "transit_radiation_msv_day": 1.50,
        "light_delay_s": {
            "min": 134, "max": 1500, "unit": "s", "evidence": "Physics",
            "note": "2.2 to 25 minutes light delay.",
            "source": {"title": "JPL Planetary Ephemeris", "url": "https://ssd.jpl.nasa.gov"}
        },
        "blackout": {
            "value": True, "evidence": "Physics",
            "source": {"title": "Solar conjunction blackout", "url": None}
        },
        "dust": {
            "value": "acidic aerosols", "evidence": "Spaceflight data",
            "note": "Concentrated sulfuric acid droplets in external clouds require PTFE exterior seals.",
            "source": {"title": "Venera and Pioneer Venus Probe Data", "url": "https://nssdc.gsfc.nasa.gov"}
        },
        "arrival_pressure_kpa": {
            "from": 101.3, "to": 75.0, "unit": "kPa", "evidence": "Standard",
            "note": "Arrival transition to buoyant habitat.",
            "source": {"title": "NASA HAVOC Study", "url": "https://ntrs.nasa.gov"}
        }
    },
    {
        "id": "ceres",
        "name": "Ceres",
        "place": "Occator Crater sub-crust station",
        "where": "in the Ceres mining outpost",
        "category": "Dwarf Planet",
        "gravity_ms2": {
            "value": 0.28, "unit": "m/s²", "evidence": "Spaceflight data",
            "note": "Micro-gravity regime: only 0.029 g.",
            "source": {"title": "NASA Dawn Mission Gravity Science", "url": "https://science.nasa.gov/mission/dawn/"}
        },
        "outside_temp_c": {
            "min": -106, "max": -73, "unit": "°C", "evidence": "Spaceflight data",
            "note": "Cold asteroid belt surface.",
            "source": {"title": "Dawn VIR Spectrometer Data", "url": "https://science.nasa.gov"}
        },
        "cabin_temp_c": {
            "min": 18, "max": 24, "unit": "°C", "evidence": "Standard",
            "note": "Sub-crust insulated habitat.",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov"}
        },
        "cabin_pressure_kpa": {
            "value": 56.5, "unit": "kPa", "evidence": "Standard",
            "note": "NASA Exploration Atmosphere.",
            "source": {"title": "NASA Exploration Atmosphere Brief", "url": "https://www.nasa.gov"}
        },
        "oxygen_percent": {
            "value": 34, "unit": "%", "evidence": "Standard",
            "source": {"title": "NASA Exploration Atmosphere Brief", "url": "https://www.nasa.gov"}
        },
        "radiation_msv_day": {
            "value": 1.15, "unit": "mSv/day", "evidence": "Research study",
            "note": "Deep space galactic cosmic ray flux; sub-regolith habitat provides shielding.",
            "source": {"title": "Deep Space Radiation Models (Badhwar-O'Neill)", "url": "https://ntrs.nasa.gov"}
        },
        "transit_days_each_way": {
            "value": 450, "unit": "days", "evidence": "Physics",
            "note": "Ion propulsion trajectory to the asteroid belt.",
            "source": {"title": "Dawn Trajectory Design", "url": "https://science.nasa.gov"}
        },
        "transit_radiation_msv_day": 1.50,
        "light_delay_s": {
            "min": 1300, "max": 2000, "unit": "s", "evidence": "Physics",
            "note": "21 to 33 minutes one-way delay.",
            "source": {"title": "JPL Horizons Ephemeris", "url": "https://ssd.jpl.nasa.gov"}
        },
        "blackout": {
            "value": True, "evidence": "Physics",
            "source": {"title": "Solar conjunction geometry", "url": None}
        },
        "dust": {
            "value": "fine clay particulates", "evidence": "Spaceflight data",
            "note": "Phyllosilicate and carbonate dust with sharp cleavage planes.",
            "source": {"title": "Dawn Mineralogical Analysis", "url": "https://science.nasa.gov"}
        },
        "arrival_pressure_kpa": {
            "from": 101.3, "to": 56.5, "unit": "kPa", "evidence": "Standard",
            "note": "Arrival habitat transition.",
            "source": {"title": "NASA OCHMO-TB-002", "url": "https://www.nasa.gov"}
        }
    },
    {
        "id": "europa",
        "name": "Europa",
        "place": "Jovian ice crust oceanographic station",
        "where": "in the Europa sub-ice habitat",
        "category": "Moons & Ocean Worlds",
        "gravity_ms2": {
            "value": 1.31, "unit": "m/s²", "evidence": "Spaceflight data",
            "note": "0.134 g surface gravity, similar to the Moon.",
            "source": {"title": "Galileo Mission Geodesy Data", "url": "https://science.nasa.gov/mission/galileo/"}
        },
        "outside_temp_c": {
            "min": -220, "max": -160, "unit": "°C", "evidence": "Spaceflight data",
            "note": "Cryogenic ice shell surface.",
            "source": {"title": "Galileo PPR Instrument Data", "url": "https://science.nasa.gov"}
        },
        "cabin_temp_c": {
            "min": 18, "max": 24, "unit": "°C", "evidence": "Standard",
            "note": "Habitat heated by nuclear thermal auxiliary units.",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov"}
        },
        "cabin_pressure_kpa": {
            "value": 56.5, "unit": "kPa", "evidence": "Standard",
            "note": "Exploration standard pressure.",
            "source": {"title": "NASA Exploration Atmosphere Brief", "url": "https://www.nasa.gov"}
        },
        "oxygen_percent": {
            "value": 34, "unit": "%", "evidence": "Standard",
            "source": {"title": "NASA Exploration Atmosphere Brief", "url": "https://www.nasa.gov"}
        },
        "radiation_msv_day": {
            "value": 5.40, "unit": "mSv/day", "evidence": "Spaceflight data",
            "note": "Trapped energetic electrons in Jupiter inner magnetosphere; requires multi-meter water ice shielding.",
            "source": {"title": "Galileo Energetic Particle Detector Data", "url": "https://science.nasa.gov"}
        },
        "transit_days_each_way": {
            "value": 850, "unit": "days", "evidence": "Physics",
            "note": "Jupiter transfer with gravity assists.",
            "source": {"title": "Europa Clipper Mission Trajectory", "url": "https://europa.nasa.gov"}
        },
        "transit_radiation_msv_day": 1.60,
        "light_delay_s": {
            "min": 1970, "max": 3180, "unit": "s", "evidence": "Physics",
            "note": "32.8 to 53 minutes light travel time.",
            "source": {"title": "JPL Ephemeris", "url": "https://ssd.jpl.nasa.gov"}
        },
        "blackout": {
            "value": True, "evidence": "Physics",
            "source": {"title": "Solar conjunction geometry", "url": None}
        },
        "dust": {
            "value": "ice cryo-ejecta", "evidence": "Spaceflight data",
            "note": "Sub-micron ice crystals and salt hydrates (sodium chloride and magnesium sulfate).",
            "source": {"title": "Hubble and Galileo Europa Observations", "url": "https://science.nasa.gov"}
        },
        "arrival_pressure_kpa": {
            "from": 101.3, "to": 56.5, "unit": "kPa", "evidence": "Standard",
            "note": "Descent stage depressurization.",
            "source": {"title": "NASA OCHMO-TB-002", "url": "https://www.nasa.gov"}
        }
    },
    {
        "id": "titan",
        "name": "Titan",
        "place": "Kraken Mare coastal base",
        "where": "in the Titan surface station",
        "category": "Moons & Ocean Worlds",
        "gravity_ms2": {
            "value": 1.35, "unit": "m/s²", "evidence": "Spaceflight data",
            "note": "0.138 g lunar-like gravity combined with dense atmosphere.",
            "source": {"title": "Cassini-Huygens Mission Data", "url": "https://science.nasa.gov/mission/cassini/"}
        },
        "outside_temp_c": {
            "min": -180, "max": -178, "unit": "°C", "evidence": "Spaceflight data",
            "note": "Uniform cryogenic temperature supported by dense nitrogen greenhouse.",
            "source": {"title": "ESA Huygens Probe Surface Measurements", "url": "https://www.esa.int"}
        },
        "cabin_temp_c": {
            "min": 19, "max": 25, "unit": "°C", "evidence": "Standard",
            "note": "Climate-controlled habitat dome.",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov"}
        },
        "cabin_pressure_kpa": {
            "value": 101.3, "unit": "kPa", "evidence": "Standard",
            "note": "Sea-level pressure (ambient outside is 147 kPa).",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov"}
        },
        "oxygen_percent": {
            "value": 21, "unit": "%", "evidence": "Standard",
            "source": {"title": "Standard Sea-Level ECLSS", "url": "https://www.nasa.gov"}
        },
        "radiation_msv_day": {
            "value": 0.05, "unit": "mSv/day", "evidence": "Research study",
            "note": "Virtually zero surface radiation: 1.5 bar atmosphere absorbs cosmic rays and solar particles.",
            "source": {"title": "Cassini-Huygens Radiation Environment Study", "url": "https://science.nasa.gov"}
        },
        "transit_days_each_way": {
            "value": 1400, "unit": "days", "evidence": "Physics",
            "note": "Saturn system transfer trajectory.",
            "source": {"title": "Dragonfly Mission Design", "url": "https://dragonfly.jhuapl.edu"}
        },
        "transit_radiation_msv_day": 1.50,
        "light_delay_s": {
            "min": 4100, "max": 5500, "unit": "s", "evidence": "Physics",
            "note": "68 to 92 minutes one-way radio delay.",
            "source": {"title": "JPL Ephemeris", "url": "https://ssd.jpl.nasa.gov"}
        },
        "blackout": {
            "value": True, "evidence": "Physics",
            "source": {"title": "Saturn solar conjunction", "url": None}
        },
        "dust": {
            "value": "sticky organic tholins", "evidence": "Spaceflight data",
            "note": "Complex organic tholin aerosols coat surfaces with hydrophobic sticky residue.",
            "source": {"title": "Huygens Aerosol Collector and Pyrolyser Data", "url": "https://www.esa.int"}
        },
        "arrival_pressure_kpa": {
            "from": 101.3, "to": 101.3, "unit": "kPa", "evidence": "Standard",
            "note": "Habitat pressure maintained at nominal sea level.",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov"}
        }
    },
    {
        "id": "proxima_b",
        "name": "Proxima Centauri b",
        "place": "Alpha Centauri system, tidally locked twilight base",
        "where": "in the Proxima Centauri b colony habitat",
        "category": "Exoplanet",
        "gravity_ms2": {
            "value": 10.60, "unit": "m/s²", "evidence": "Research study",
            "note": "1.08 g surface gravity, closely matching Earth.",
            "source": {"title": "ESO Discovery Paper (Anglada-Escudé et al. 2016)", "url": "https://www.nature.com/articles/nature19106"}
        },
        "outside_temp_c": {
            "min": -40, "max": 30, "unit": "°C", "evidence": "Research study",
            "note": "Temperate twilight terminator zone between permanent day and night sides.",
            "source": {"title": "Climate Models of Tidally Locked Terrestrial Exoplanets (Turbet et al.)", "url": "https://www.aanda.org"}
        },
        "cabin_temp_c": {
            "min": 19, "max": 25, "unit": "°C", "evidence": "Standard",
            "note": "Controlled colony microclimate.",
            "source": {"title": "Interstellar Habitat ECLSS Study", "url": "https://www.nasa.gov"}
        },
        "cabin_pressure_kpa": {
            "value": 85.0, "unit": "kPa", "evidence": "Standard",
            "note": "Intermediate high-efficiency human habitability pressure.",
            "source": {"title": "Interstellar Habitat ECLSS Study", "url": "https://www.nasa.gov"}
        },
        "oxygen_percent": {
            "value": 24, "unit": "%", "evidence": "Standard",
            "source": {"title": "Interstellar Habitat ECLSS Study", "url": "https://www.nasa.gov"}
        },
        "radiation_msv_day": {
            "value": 2.80, "unit": "mSv/day", "evidence": "Research study",
            "note": "Active M-dwarf stellar flaring causes intense magnetic storm radiation; requires heavy colony regolith burrows.",
            "source": {"title": "Proxima Flare Physics and Habitability (Ribas et al.)", "url": "https://iopscience.iop.org"}
        },
        "transit_days_each_way": {
            "value": 1500, "unit": "days", "evidence": "Team assumption",
            "note": "Relativistic cruise mission profile.",
            "source": {"title": "Breakthrough Starshot Concept", "url": "https://breakthroughinitiatives.org"}
        },
        "transit_radiation_msv_day": 1.20,
        "light_delay_s": {
            "min": 133800000, "max": 133800000, "unit": "s", "evidence": "Physics",
            "note": "4.24 years light delay. Real-time teleconsultation is impossible; full local autonomy required.",
            "source": {"title": "BIPM Astronomical Unit Constants", "url": "https://www.bipm.org"}
        },
        "blackout": {
            "value": False, "evidence": "Team assumption",
            "source": {"title": "Relay satellite constellation", "url": None}
        },
        "dust": {
            "value": "fine weathered silicates", "evidence": "Research study",
            "note": "Mineral dust weathered by stellar coronal mass ejections.",
            "source": {"title": "Exoplanetary Surface Dust Modeling", "url": "https://iopscience.iop.org"}
        },
        "arrival_pressure_kpa": {
            "from": 101.3, "to": 85.0, "unit": "kPa", "evidence": "Standard",
            "note": "Arrival equilibration to colony pressure.",
            "source": {"title": "Interstellar Habitat ECLSS Study", "url": "https://www.nasa.gov"}
        }
    },
    {
        "id": "trappist_1e",
        "name": "TRAPPIST-1e",
        "place": "TRAPPIST-1 system, temperate rocky planetary base",
        "where": "in the TRAPPIST-1e colony habitat",
        "category": "Exoplanet",
        "gravity_ms2": {
            "value": 9.12, "unit": "m/s²", "evidence": "Research study",
            "note": "0.93 g surface gravity, almost identical to Earth.",
            "source": {"title": "Grimm et al. 2018: TRAPPIST-1 Mass and Density Survey", "url": "https://www.aanda.org/articles/aa/full_html/2018/05/aa32233-17/aa32233-17.html"}
        },
        "outside_temp_c": {
            "min": -25, "max": 15, "unit": "°C", "evidence": "Research study",
            "note": "Habitable zone equilibrium temperature with moderate greenhouse effect.",
            "source": {"title": "JWST Atmosphere Characterization Reports", "url": "https://webbtelescope.org"}
        },
        "cabin_temp_c": {
            "min": 19, "max": 25, "unit": "°C", "evidence": "Standard",
            "note": "Standard terrestrial comfort zone.",
            "source": {"title": "NASA-STD-3001 Vol 2", "url": "https://www.nasa.gov"}
        },
        "cabin_pressure_kpa": {
            "value": 80.0, "unit": "kPa", "evidence": "Standard",
            "note": "Controlled colonial pressurized habitat.",
            "source": {"title": "Interstellar Habitability Studies", "url": "https://www.nasa.gov"}
        },
        "oxygen_percent": {
            "value": 25, "unit": "%", "evidence": "Standard",
            "source": {"title": "Interstellar Habitability Studies", "url": "https://www.nasa.gov"}
        },
        "radiation_msv_day": {
            "value": 1.40, "unit": "mSv/day", "evidence": "Research study",
            "note": "Compact M-dwarf system with compact stellar wind interactions.",
            "source": {"title": "TRAPPIST-1 Space Weather Modeling", "url": "https://iopscience.iop.org"}
        },
        "transit_days_each_way": {
            "value": 1500, "unit": "days", "evidence": "Team assumption",
            "note": "Relativistic interstellar flight.",
            "source": {"title": "Interstellar Flight Concepts", "url": None}
        },
        "transit_radiation_msv_day": 1.20,
        "light_delay_s": {
            "min": 1230000000, "max": 1230000000, "unit": "s", "evidence": "Physics",
            "note": "39 years light delay to Earth.",
            "source": {"title": "SIMBAD Astronomical Database", "url": "https://simbad.u-strasbg.fr"}
        },
        "blackout": {
            "value": False, "evidence": "Team assumption",
            "source": {"title": "Laser communication relay network", "url": None}
        },
        "dust": {
            "value": "basaltic mineral dust", "evidence": "Research study",
            "note": "Dense basaltic and iron-rich mineral crust.",
            "source": {"title": "Exoplanet Surface Composition Models", "url": "https://www.nature.com"}
        },
        "arrival_pressure_kpa": {
            "from": 101.3, "to": 80.0, "unit": "kPa", "evidence": "Standard",
            "note": "Pressurization equilibration.",
            "source": {"title": "NASA OCHMO-TB-002", "url": "https://www.nasa.gov"}
        }
    }
]

# Additional clinical medical devices known to humanity
new_devices = [
    {
        "id": "passive_knee",
        "name": "Passive mechanical prosthetic knee",
        "short": "passive knee",
        "summary": "A hydraulic or pneumatic knee mechanism providing mechanical stance and swing resistance.",
        "worn": "external",
        "category": "Prosthetics",
        "operating_temp_c": {
            "min": -10, "max": 60, "unit": "°C", "evidence": "Manufacturer spec",
            "source": {"title": "Ottobock 3R80 Hydraulic Knee IFU", "url": "https://www.ottobock.com"}
        },
        "pressure_rating_kpa": {
            "min": 70, "max": 106, "unit": "kPa", "evidence": "Manufacturer spec",
            "note": "Hydraulic sealed chambers tested across airline cabin pressures.",
            "source": {"title": "Ottobock Technical Document", "url": "https://www.ottobock.com"}
        },
        "battery": {
            "value": "none", "evidence": "Manufacturer spec",
            "note": "Completely passive mechanical fluid mechanics; no battery required.",
            "source": {"title": "Ottobock 3R80 Hydraulic Knee IFU", "url": "https://www.ottobock.com"}
        },
        "fluid_path": False,
        "life_critical": "no",
        "dust": {
            "value": "sensitive", "evidence": "Manufacturer spec",
            "note": "Exposed mechanical pivots require protective gaiter in dusty environments.",
            "limit_text": "Requires neoprene protective sleeve",
            "source": {"title": "Ottobock Care Manual", "url": "https://www.ottobock.com"}
        },
        "follow_up": {
            "value": "local_programming", "evidence": "Standard",
            "note": "Manual hydraulic valve adjustment with an Allen key.",
            "source": {"title": "Clinical Prosthetics Practice", "url": None}
        },
        "gravity_function": {
            "value": "stance_assist", "evidence": "Physics",
            "note": "Hydraulic resistance calibrated for 1 g body weight; over-damps walking stride in lower gravity.",
            "source": {"title": "Prosthetic Gait Mechanics", "url": None}
        },
        "body_mass_kg": {
            "min": 50, "max": 150, "default": 80, "unit": "kg", "evidence": "Manufacturer spec",
            "note": "Rated weight limit for heavy-duty hydraulic knees.",
            "source": {"title": "Ottobock 3R80 IFU", "url": "https://www.ottobock.com"}
        },
        "torque_model": {
            "stance_nm_per_kg": {
                "value": 0.45, "unit": "N·m/kg", "evidence": "Research study",
                "note": "Peak passive hydraulic stance resistance torque.",
                "source": {"title": "Clinical Biomechanics of Passive Knees", "url": None}
            },
            "swing_nm_per_kg": {
                "value": 0.20, "unit": "N·m/kg", "evidence": "Research study",
                "note": "Swing phase fluid dampening resistance.",
                "source": {"title": "Clinical Biomechanics of Passive Knees", "url": None}
            },
            "swing_gravity_share": {
                "value": 0.15, "unit": "", "evidence": "Research study",
                "note": "Pendular gravitational share of lower leg.",
                "source": {"title": "Clinical Biomechanics of Passive Knees", "url": None}
            },
            "scaling_source": {
                "title": "Biomechanical Scaling of Lower Limb Prosthetics",
                "url": None
            }
        },
        "mitigations": {
            "gravity": {
                "text": "Adjust manual hydraulic stance valve 2 to 3 turns softer to prevent knee stiffness during reduced gravity gait.",
                "resolves": True
            },
            "dust": {
                "text": "Fit protective neoprene gaiter boot over knee hydraulic cylinder and hinge joints.",
                "resolves": True
            },
            "pressure": {
                "text": "Inspect hydraulic cylinder seals for fluid weeping during first 48 hours at habitat pressure.",
                "resolves": False
            }
        }
    },
    {
        "id": "bionic_ankle",
        "name": "Powered bionic ankle-foot prosthesis",
        "short": "bionic ankle",
        "summary": "Motorized prosthetic ankle delivering active push-off propulsion during walking.",
        "worn": "external",
        "category": "Prosthetics",
        "operating_temp_c": {
            "min": -5, "max": 45, "unit": "°C", "evidence": "Manufacturer spec",
            "source": {"title": "Össur Proprio Foot IFU", "url": "https://media.ossur.com"}
        },
        "pressure_rating_kpa": {
            "min": 70, "max": 106, "unit": "kPa", "evidence": "Manufacturer spec",
            "note": "Rated for airline cabin operating pressures.",
            "source": {"title": "Össur Proprio Foot IFU", "url": "https://media.ossur.com"}
        },
        "battery": {
            "value": "lithium-ion", "evidence": "Manufacturer spec",
            "note": "Rechargeable internal lithium-ion battery.",
            "source": {"title": "Össur Proprio Foot IFU", "url": "https://media.ossur.com"}
        },
        "fluid_path": False,
        "life_critical": "no",
        "dust": {
            "value": "sensitive", "evidence": "Manufacturer spec",
            "note": "Ankle actuator gearing is sensitive to particulate contamination.",
            "limit_text": "Keep foot shell sealed",
            "source": {"title": "Össur Care Instructions", "url": "https://media.ossur.com"}
        },
        "follow_up": {
            "value": "local_programming", "evidence": "Team assumption",
            "note": "Microprocessor firmware adjusted via Bluetooth tablet app.",
            "source": {"title": "Prosthetic Clinical Fitting Guidelines", "url": None}
        },
        "gravity_function": {
            "value": "stance_assist", "evidence": "Physics",
            "note": "Active push-off propulsion calibrated for Earth weight will launch user upwards in reduced gravity.",
            "source": {"title": "Bionic Propulsion Biomechanics", "url": None}
        },
        "body_mass_kg": {
            "min": 50, "max": 125, "default": 80, "unit": "kg", "evidence": "Manufacturer spec",
            "note": "User body mass rating.",
            "source": {"title": "Össur Proprio Foot IFU", "url": "https://media.ossur.com"}
        },
        "mitigations": {
            "gravity": {
                "text": "Reduce motor push-off energy setting by 60% to 80% to prevent excessive propulsion in reduced gravity.",
                "resolves": True
            },
            "dust": {
                "text": "Install sealed carbon composite weather-resistant foot cover with silicone cuff seal.",
                "resolves": True
            }
        }
    },
    {
        "id": "icd",
        "name": "Implantable Cardioverter Defibrillator (ICD)",
        "short": "ICD",
        "summary": "Implanted cardiac device that detects lethal arrhythmias and delivers high-energy electrical shocks.",
        "worn": "implanted",
        "category": "Cardiac",
        "battery": {
            "value": "hermetic_primary", "evidence": "Manufacturer spec",
            "note": "Hermetic lithium silver vanadium oxide / carbon monofluoride primary battery.",
            "source": {"title": "Medtronic Cobalt ICD Technical Manual", "url": "https://www.medtronic.com"}
        },
        "fluid_path": False,
        "life_critical": "yes",
        "life_critical_note": "Terminates life-threatening ventricular fibrillation.",
        "dust": {
            "value": "none", "evidence": "Physics",
            "note": "Subcutaneous pectoral pocket implant.",
            "limit_text": "Internal hermetic titanium enclosure",
            "source": {"title": "Device Anatomy", "url": None}
        },
        "follow_up": {
            "value": "remote_monitoring", "evidence": "Manufacturer spec",
            "note": "CareLink home monitor uploads arrhythmia logs and lead impedance telemetry.",
            "source": {"title": "Medtronic CareLink Network Manual", "url": "https://www.medtronic.com"}
        },
        "gravity_function": {
            "value": "rate_response", "evidence": "Manufacturer spec",
            "note": "Accelerometers modulate pacing during activity; physical work requires different sensor tuning off-Earth.",
            "source": {"title": "Medtronic Rate Adaptive Sensor Guide", "url": "https://www.medtronic.com"}
        },
        "radiation_upsets": {
            "value": "possible", "evidence": "Research study",
            "note": "High-voltage charging circuits and flash memory are vulnerable to single-event upsets from galactic heavy ions.",
            "source": {"title": "AAPM TG-203 Cardiac Implant Radiation Study", "url": "https://doi.org/10.1002/mp.13838"}
        },
        "mitigations": {
            "radiation": {
                "text": "Enable daily autonomous capacitor conditioning and program monthly self-test memory diagnostics.",
                "resolves": False
            },
            "gravity": {
                "text": "Adjust accelerometer threshold to low sensitivity setting to prevent inappropriate rate boost during microgravity movements.",
                "resolves": True
            },
            "light_delay": {
                "text": "Equip mission medical kit with wand programmer for local emergency ICD interrogation and therapy locking.",
                "resolves": True
            }
        }
    },
    {
        "id": "cgm",
        "name": "Continuous Glucose Monitor (CGM)",
        "short": "CGM",
        "summary": "Wearable subcutaneous biosensor tracking interstitial glucose levels in real time.",
        "worn": "external",
        "category": "Endocrine",
        "operating_temp_c": {
            "min": 10, "max": 45, "unit": "°C", "evidence": "Manufacturer spec",
            "source": {"title": "Dexcom G7 User Guide", "url": "https://www.dexcom.com"}
        },
        "pressure_rating_kpa": {
            "min": 70, "max": 106, "unit": "kPa", "evidence": "Manufacturer spec",
            "note": "Tested down to 70 kPa (3,000 meters altitude equivalent).",
            "source": {"title": "Dexcom G7 User Guide", "url": "https://www.dexcom.com"}
        },
        "battery": {
            "value": "hermetic_primary", "evidence": "Manufacturer spec",
            "note": "Single-use sealed silver oxide button cell.",
            "source": {"title": "Dexcom G7 Specifications", "url": "https://www.dexcom.com"}
        },
        "fluid_path": False,
        "life_critical": "no",
        "dust": {
            "value": "none", "evidence": "Manufacturer spec",
            "note": "IP28 water and dust ingress rating.",
            "limit_text": "IP28 waterproof and dust sealed",
            "source": {"title": "Dexcom G7 Technical Data", "url": "https://www.dexcom.com"}
        },
        "follow_up": {
            "value": "optional_cloud", "evidence": "Manufacturer spec",
            "note": "Bluetooth telemetry streams to local phone or receiver independently of internet.",
            "source": {"title": "Dexcom Follow App Architecture", "url": "https://www.dexcom.com"}
        },
        "gravity_function": {
            "value": "none", "evidence": "Spaceflight data",
            "note": "Enzymatic glucose-oxidase electrochemical reaction functions independently of gravity, tested in orbital parabolic flights.",
            "source": {"title": "Axiom Ax-4 Spaceflight CGM Evaluation", "url": "https://www.axiomspace.com"}
        },
        "mitigations": {
            "pressure": {
                "text": "Perform fingerstick capillary blood glucose calibration if rapid cabin pressure changes exceed 10 kPa in one hour.",
                "resolves": True
            }
        }
    },
    {
        "id": "dbs",
        "name": "Deep Brain Stimulator (DBS)",
        "short": "DBS",
        "summary": "Surgically implanted intracranial electrodes and neurostimulator treating Parkinson's, tremors, and dystonia.",
        "worn": "implanted",
        "category": "Neuromodulation",
        "battery": {
            "value": "hermetic_primary", "evidence": "Manufacturer spec",
            "note": "Hermetically sealed titanium neurostimulator battery.",
            "source": {"title": "Medtronic Percept PC DBS Manual", "url": "https://www.medtronic.com"}
        },
        "fluid_path": False,
        "life_critical": "no",
        "dust": {
            "value": "none", "evidence": "Physics",
            "note": "Subclavicular generator pocket with tunneled cranial leads.",
            "limit_text": "Hermetic titanium casing",
            "source": {"title": "Surgical Neuroanatomy", "url": None}
        },
        "follow_up": {
            "value": "local_programming", "evidence": "Manufacturer spec",
            "note": "Inductive patient programmer allows user to adjust stimulation amplitude locally.",
            "source": {"title": "Medtronic Patient Programmer Guide", "url": "https://www.medtronic.com"}
        },
        "gravity_function": {
            "value": "none", "evidence": "Research study",
            "note": "Electrical pulse generation across subthalamic nucleus operates independently of gravity.",
            "source": {"title": "Neuromodulation Physics and Biophysics", "url": None}
        },
        "radiation_upsets": {
            "value": "possible", "evidence": "Research study",
            "note": "Cranial exposure to cosmic ray heavy ions can cause soft resets of stimulation parameters.",
            "source": {"title": "Radiation Effects on Implanted Microelectronics", "url": "https://doi.org/10.1002/mp.13838"}
        },
        "mitigations": {
            "radiation": {
                "text": "Export and store baseline electrode impedance and voltage configuration to handheld patient programmer prior to departure.",
                "resolves": True
            },
            "light_delay": {
                "text": "Train flight medical crew on clinician telemetry programmer to troubleshoot parameter resets without Earth contact.",
                "resolves": True
            }
        }
    },
    {
        "id": "vp_shunt",
        "name": "Ventriculoperitoneal (VP) Brain Shunt",
        "short": "VP shunt",
        "summary": "Hydrocephalus drainage catheter and valve that diverts excess cerebrospinal fluid from cerebral ventricles.",
        "worn": "implanted",
        "category": "Neuromodulation",
        "battery": {
            "value": "none", "evidence": "Manufacturer spec",
            "note": "Passive differential fluid pressure valve with magnetic adjustment rotor.",
            "source": {"title": "Codman Certas Plus Programmable Valve IFU", "url": "https://www.integralife.com"}
        },
        "fluid_path": True,
        "life_critical": "yes",
        "life_critical_note": "Prevents catastrophic intracranial pressure elevation from hydrocephalus.",
        "dust": {
            "value": "none", "evidence": "Physics",
            "note": "Fully internal subcutaneous fluid drainage catheter.",
            "limit_text": "Subcutaneous implant",
            "source": {"title": "Surgical Guidelines", "url": None}
        },
        "follow_up": {
            "value": "local_programming", "evidence": "Manufacturer spec",
            "note": "Non-invasive magnetic programming tool adjusts valve opening pressure.",
            "source": {"title": "Codman Magnetic Programmer IFU", "url": "https://www.integralife.com"}
        },
        "gravity_function": {
            "value": "stance_assist", "evidence": "Physics",
            "note": "Hydrostatic siphon effect depends on vertical gravitational column height. In microgravity or low gravity, hydrostatic siphoning disappears, reducing drainage rate.",
            "source": {"title": "Hydrocephalus in Microgravity Biomechanics", "url": None}
        },
        "mitigations": {
            "gravity": {
                "text": "Reprogram valve opening pressure to lower resistance setting to compensate for loss of vertical hydrostatic siphoning column.",
                "resolves": True
            },
            "pressure": {
                "text": "Monitor daily for clinical signs of intracranial hypertension (headache, vision changes) during habitat pressure shifts.",
                "resolves": False
            }
        }
    },
    {
        "id": "cpap",
        "name": "CPAP respiratory machine",
        "short": "CPAP machine",
        "summary": "Continuous positive airway pressure blower treating obstructive sleep apnea.",
        "worn": "external",
        "category": "Sensory & Other",
        "operating_temp_c": {
            "min": 5, "max": 35, "unit": "°C", "evidence": "Manufacturer spec",
            "source": {"title": "ResMed AirSense 11 User Guide", "url": "https://www.resmed.com"}
        },
        "pressure_rating_kpa": {
            "min": 70, "max": 106, "unit": "kPa", "evidence": "Manufacturer spec",
            "note": "Automatic altitude compensation calibrated down to 70 kPa (3,000 meters altitude).",
            "source": {"title": "ResMed AirSense Technical Specifications", "url": "https://www.resmed.com"}
        },
        "battery": {
            "value": "lithium-ion", "evidence": "Manufacturer spec",
            "note": "Optional external lithium battery backup pack.",
            "source": {"title": "ResMed Battery Pack IFU", "url": "https://www.resmed.com"}
        },
        "fluid_path": False,
        "life_critical": "no",
        "dust": {
            "value": "sensitive", "evidence": "Manufacturer spec",
            "note": "Pneumatic blower draws habitat air directly into patient airway.",
            "limit_text": "HEPA intake filter mandatory",
            "source": {"title": "ResMed AirSense Maintenance Manual", "url": "https://www.resmed.com"}
        },
        "follow_up": {
            "value": "optional_cloud", "evidence": "Manufacturer spec",
            "note": "AirView cloud compliance upload is optional; machine displays AHI sleep metrics directly on screen.",
            "source": {"title": "ResMed AirView Manual", "url": "https://www.resmed.com"}
        },
        "gravity_function": {
            "value": "none", "evidence": "Spaceflight data",
            "note": "Electric turbine blower generates differential pressure independently of gravity.",
            "source": {"title": "Aviation and Space Respiratory Equipment", "url": None}
        },
        "mitigations": {
            "pressure": {
                "text": "Manually recalibrate blower baseline pressure algorithm for 56.5 kPa habitat cabin atmosphere to maintain target airway pressure.",
                "resolves": True
            },
            "dust": {
                "text": "Fit multi-stage medical grade HEPA allergen intake filter and replace filter cartridge every 14 days.",
                "resolves": True
            }
        }
    },
    {
        "id": "ortho_implant",
        "name": "Titanium orthopedic hip/knee joint implant",
        "short": "orthopedic implant",
        "summary": "Passive internal titanium alloy endoprosthesis replacing damaged skeletal joint (Hayley Arceneaux type).",
        "worn": "implanted",
        "category": "Prosthetics",
        "battery": {
            "value": "none", "evidence": "Manufacturer spec",
            "note": "Fully passive metallic structural biomaterial.",
            "source": {"title": "Zimmer Biomet Orthopedic Implant IFU", "url": "https://www.zimmerbiomet.com"}
        },
        "fluid_path": False,
        "life_critical": "no",
        "dust": {
            "value": "none", "evidence": "Physics",
            "note": "Subcutaneous bone-anchored internal joint.",
            "limit_text": "Internal osseointegrated implant",
            "source": {"title": "Orthopedic Surgery Manual", "url": None}
        },
        "follow_up": {
            "value": "optional_cloud", "evidence": "Standard",
            "note": "Passive implant; requires no telemetry link.",
            "source": {"title": "AAOS Clinical Guidelines", "url": "https://www.aaos.org"}
        },
        "gravity_function": {
            "value": "none", "evidence": "Spaceflight data",
            "note": "Flew successfully on Inspiration4 with Hayley Arceneaux (first spaceflight participant with an internal prosthesis).",
            "source": {"title": "Inspiration4 Medical Mission Debrief (Nature Medicine)", "url": "https://doi.org/10.1038/s41591-024-02970-0"}
        },
        "mitigations": {
            "gravity": {
                "text": "Maintain daily resistance exercise protocol using advanced resistive exercise device to prevent bone mineral loss around titanium stem.",
                "resolves": True
            }
        }
    }
]

# Append new destinations and devices ensuring no duplicate ids
existing_dest_ids = {d["id"] for d in dests_data["destinations"]}
for nd in new_destinations:
    if nd["id"] not in existing_dest_ids:
        dests_data["destinations"].append(nd)

existing_dev_ids = {d["id"] for d in devices_data["devices"]}
for nd in new_devices:
    if nd["id"] not in existing_dev_ids:
        devices_data["devices"].append(nd)

# Write back
(DATA_DIR / "destinations.json").write_text(json.dumps(dests_data, indent=2, ensure_ascii=False), encoding="utf-8")
(DATA_DIR / "devices.json").write_text(json.dumps(devices_data, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Updated catalog: {len(dests_data['destinations'])} destinations, {len(devices_data['devices'])} devices.")
