import { useEffect, useRef, useState } from "react";
import { countries } from "../learning/countries";

const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
let mapsLoader;
function loadMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (!mapsLoader) mapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(mapsKey) + "&v=weekly&loading=async";
    script.async = true;
    script.onload = () => window.google?.maps?.importLibrary ? resolve(window.google.maps) : reject(new Error("Google Maps could not load."));
    script.onerror = () => reject(new Error("Google Maps is unavailable. Use manual entry instead."));
    document.head.appendChild(script);
  }).catch(error => { mapsLoader = null; throw error; });
  return mapsLoader;
}
function addressValues(components = []) {
  const get = type => components.find(c=>c.types.includes(type))?.longText || "";
  return { country:get("country"), region:get("administrative_area_level_1"), city:get("locality") || get("postal_town") || get("administrative_area_level_2") };
}
function GoogleMapPicker({ onSelected, initialLat, initialLng }) {
  const container = useRef(null), search = useRef(null), callback = useRef(onSelected);
  const [error,setError] = useState("");
  useEffect(() => { callback.current = onSelected; }, [onSelected]);
  useEffect(() => {
    let disposed = false, element, listener, marker, map;
    (async () => {
      try {
        const g = await loadMaps();
        const [{Map}, {PlaceAutocompleteElement}] = await Promise.all([
          g.importLibrary("maps"), g.importLibrary("places")
        ]);
        if (disposed || !container.current || !search.current) return;
        const center = {lat: Number.isFinite(initialLat) ? initialLat : 6.3156, lng: Number.isFinite(initialLng) ? initialLng : -10.8074};
        map = new Map(container.current, {center,zoom:12,mapTypeControl:false,streetViewControl:false});
        const geocoder = new g.Geocoder();
        const putPin = location => {
          if (marker) marker.setMap(null);
          marker = new g.Marker({map,position:location});
          map.panTo(location);
        };
        if (Number.isFinite(initialLat) && Number.isFinite(initialLng)) putPin(center);
        map.addListener("click", async event => {
          const point={lat:event.latLng.lat(),lng:event.latLng.lng()};
          putPin(point);
          try {
            const result=await geocoder.geocode({location:point});
            if (!disposed) callback.current({ latitude:point.lat, longitude:point.lng,
              location:result.results[0]?.formatted_address || point.lat.toFixed(5)+", "+point.lng.toFixed(5),
              ...addressValues((result.results[0]?.address_components||[]).map(c=>({types:c.types,longText:c.long_name}))) });
          } catch {
            if (!disposed) callback.current({latitude:point.lat,longitude:point.lng,location:point.lat.toFixed(5)+", "+point.lng.toFixed(5)});
          }
        });
        element=new PlaceAutocompleteElement({placeholder:"Search address, landmark or organization"});
        element.setAttribute("aria-label","Search Google Maps location");
        search.current.appendChild(element);
        listener=async event => {
          try {
            const place=event.placePrediction.toPlace();
            await place.fetchFields({fields:["formattedAddress","location","addressComponents"]});
            if (disposed || !place.location) return;
            const point={lat:place.location.lat(),lng:place.location.lng()};
            putPin(point);
            map.setZoom(16);
            callback.current({latitude:point.lat,longitude:point.lng,
              location:place.formattedAddress || "",
              ...addressValues(place.addressComponents || [])});
          } catch { if (!disposed) setError("Location details unavailable. Drop a pin or enter the address manually."); }
        };
        element.addEventListener("gmp-select", listener);
      } catch (cause) { if (!disposed) setError(cause.message); }
    })();
    return () => {disposed=true;if(element && listener)element.removeEventListener("gmp-select",listener);element?.remove(); if(marker)marker.setMap(null);if(map)window.google?.maps?.event?.clearInstanceListeners(map);};
  }, [initialLat,initialLng]);
  return <div className="bw-op-job-map" aria-label="Google Maps location picker">
    <div ref={search}/>
    <div ref={container} className="bw-op-job-map-canvas" aria-label="Click the map to select the workplace location" />
    {error && <p role="status">{error}</p>}
    <p className="bw-op-job-hint">Search for a place or click the map to drop a pin. The organization does not need a Google Maps listing.</p>
  </div>;
}

export default function JobLocationPicker({draft,field,details,onDetails}) {
  const [openMap,setOpenMap] = useState(false);
  const remote=draft.workMode==="REMOTE";
  const scope=details.locationScope || "SPECIFIC";
  const edit=(key,value)=>{
    const next={...details,[key]:value};
    onDetails(next);
    if (key !== "address") field("location",[next.city,next.region,next.country].filter(Boolean).join(", "));
  };
  const selected=values=>values.join(", ");
  const mapSelected=place=>{
    onDetails({...details,...Object.fromEntries(Object.entries(place).filter(([key])=>key!=="location"))});
    field("location",place.location);
  };
  return <section className="bw-op-challenge-section bw-op-job-group">
    <h4>Work Arrangement & Location</h4>
    <label>Work Arrangement<select value={draft.workMode} onChange={e=>field("workMode",e.target.value)}>
      <option value="IN_PERSON">On-site</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option>
    </select></label>
    {remote ? <>
      <label>Remote work eligibility<select value={scope} onChange={e=>{
        onDetails({...details,locationScope:e.target.value});
        field("location",e.target.value==="WORLDWIDE"?"Worldwide":"");
      }}>
        <option value="WORLDWIDE">Worldwide</option><option value="SPECIFIC">Specific countries</option>
      </select></label>
      {scope==="SPECIFIC" && <label>Eligible countries (one per line)<textarea rows={2}
        value={(details.eligibleCountries || []).join("\n")}
        onChange={e=>{
          const names=e.target.value.split("\n");
          onDetails({...details,eligibleCountries:names});
          field("location",selected(names.filter(Boolean)));
        }} placeholder="Liberia"/></label>}
    </> : <>
      <p className="bw-op-job-hint">Find the workplace with Google Maps, drop a pin, or enter the location manually.</p>
      {mapsKey ? <button type="button" className="bw-op-secondary" aria-expanded={openMap}
        onClick={()=>setOpenMap(v=>!v)}>{openMap?"Hide Google Maps":"Find on Google Maps / Drop a pin"}</button> :
        <p className="bw-op-job-hint">Map search is not configured. Manual entry is available below.</p>}
      {openMap && mapsKey && <GoogleMapPicker initialLat={details.latitude} initialLng={details.longitude} onSelected={mapSelected}/>}
      <div className="bw-op-field-row">
        <label>Country<input list="bw-job-countries" value={details.country || ""} onChange={e=>edit("country",e.target.value)} placeholder="Liberia" />
          <datalist id="bw-job-countries">{countries.map(x=><option key={x.name} value={x.name}/>)}</datalist>
        </label>
        <label>County / State<input value={details.region || ""} onChange={e=>edit("region",e.target.value)} placeholder="Montserrado"/></label>
      </div>
      <label>City / Town<input value={details.city || ""} onChange={e=>edit("city",e.target.value)} placeholder="Monrovia"/></label>
      <label>Work Address (optional)<input value={details.address || ""} onChange={e=>edit("address",e.target.value)} placeholder="Street, building or nearby landmark"/></label>
    </>}
    <label>Location shown on job listing<input required minLength={2} maxLength={180} value={draft.location}
      onChange={e=>field("location",e.target.value)} placeholder={remote?"Eligible countries or Worldwide":"Monrovia, Liberia"} /></label>
    <p className="bw-op-job-hint">Only this public location label is displayed; any exact map pin is kept for the employer's location settings.</p>
  </section>;
}
