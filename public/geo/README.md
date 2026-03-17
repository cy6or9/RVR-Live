# Ohio River Geospatial Data

## ohio-river.json

**Source:** USGS National Hydrography Dataset (NHD)  
**Date Downloaded:** December 20, 2025  
**Date Sorted:** December 20, 2025  
**Data Points:** 47,433 coordinates  
**Continuous Segments:** 17 segments  
**Total Path Length:** ~1,665 miles

This file contains the actual navigation channel of the Ohio River from Pittsburgh, PA to Cairo, IL, extracted from authoritative U.S. government hydrographic data.

### ⚠️ Important: Coordinate Order

The coordinates in this file have been **sorted to create a continuous path** from Pittsburgh to Cairo. The original USGS data contained points in random order, which caused the map to render incorrect paths. See the "Coordinate Sorting" section below for details.

### Data Source Information

**Primary Source:** USGS National Hydrography Dataset  
**API Endpoint:** https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query  
**Query:** `gnis_name='Ohio River'`  
**Format:** GeoJSON (converted to [lat, lon] for Leaflet)

### Authoritative Sources Used

1. **USGS National Hydrography Dataset (NHD)**
   - Official U.S. government hydrographic data
   - Includes flowlines for all rivers and streams
   - Public domain, free to use
   - URL: https://www.usgs.gov/national-hydrography

2. **USGS 3D Hydrography Program (3DHP)**
   - Next-generation replacement for NHD
   - More detailed and accurate
   - URL: https://3dhp.nationalmap.gov/

3. **USACE Inland Electronic Navigational Charts (IENCs)**
   - Official navigation charts for inland rivers
   - Used by commercial vessels
   - URL: https://ienccloud.us/

### How to Update This Data

Run the fetch script:
```bash
node scripts/fetch-river-data.js
```

This will:
1. Query USGS NHD API for Ohio River flowlines
2. Extract and process geometry data
3. Save to this file (ohio-river.json)

**After fetching new data, you must sort it:**
```bash
node scripts/sort-river-segments.js
```

This sorts the coordinates into proper order for path rendering.

### Coordinate Sorting

The raw USGS data contains coordinates in random order across multiple disconnected segments. To render a proper continuous path on the map, the coordinates must be sorted.

**Problem:** Unsorted coordinates create a chaotic, zigzagging path  
**Solution:** Segment-based sorting algorithm

**Sorting Process:**
1. Identify continuous segments (points < 2km apart)
2. Order segments by distance from Pittsburgh (upstream)
3. Connect segments to minimize gaps

**Scripts:**
- `/scripts/sort-river-segments.js` - Main sorting algorithm (recommended)
- `/scripts/validate-river-path.js` - Validate sorted coordinates

**Results:**
- 17 continuous segments properly ordered
- Average point spacing: 57 meters
- Only 11 gaps larger than 5km
- Proper flow from Pittsburgh (40.44°N) to Cairo (36.99°N)

### Data Accuracy

✅ **Real hydrographic data** from USGS (not estimated or interpolated)  
✅ **Navigation channel** follows actual river path with all bends and curves  
✅ **47,433 points** provide high-resolution accuracy  
✅ **Properly ordered** from upstream to downstream for accurate path rendering  
✅ **Authoritative source** - same data used by NOAA, USACE, and marine navigation systems

### License

Public domain - USGS data is free to use for any purpose.
