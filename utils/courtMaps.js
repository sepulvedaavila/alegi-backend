/**
 * Comprehensive Court Mapping for CourtListener API
 * Maps jurisdictions and states to CourtListener court codes
 */

// Federal Court Codes
const FEDERAL_COURTS = {
  // Circuit Courts of Appeals
  'ca1': 'First Circuit Court of Appeals',
  'ca2': 'Second Circuit Court of Appeals', 
  'ca3': 'Third Circuit Court of Appeals',
  'ca4': 'Fourth Circuit Court of Appeals',
  'ca5': 'Fifth Circuit Court of Appeals',
  'ca6': 'Sixth Circuit Court of Appeals',
  'ca7': 'Seventh Circuit Court of Appeals',
  'ca8': 'Eighth Circuit Court of Appeals',
  'ca9': 'Ninth Circuit Court of Appeals',
  'ca10': 'Tenth Circuit Court of Appeals',
  'ca11': 'Eleventh Circuit Court of Appeals',
  'cadc': 'District of Columbia Circuit Court of Appeals',
  'cafc': 'Federal Circuit Court of Appeals',
  'cavet': 'Veterans Claims Court of Appeals',
  
  // District Courts
  'alnd': 'Alabama Northern District Court',
  'alsd': 'Alabama Southern District Court',
  'alnd': 'Alabama Middle District Court',
  'akd': 'Alaska District Court',
  'azd': 'Arizona District Court',
  'ared': 'Arkansas Eastern District Court',
  'arwd': 'Arkansas Western District Court',
  'cand': 'California Northern District Court',
  'caed': 'California Eastern District Court',
  'cacd': 'California Central District Court',
  'casd': 'California Southern District Court',
  'cod': 'Colorado District Court',
  'ctd': 'Connecticut District Court',
  'ded': 'Delaware District Court',
  'dcd': 'District of Columbia District Court',
  'flnd': 'Florida Northern District Court',
  'flmd': 'Florida Middle District Court',
  'flsd': 'Florida Southern District Court',
  'gand': 'Georgia Northern District Court',
  'gamd': 'Georgia Middle District Court',
  'gasd': 'Georgia Southern District Court',
  'gud': 'Guam District Court',
  'hid': 'Hawaii District Court',
  'idd': 'Idaho District Court',
  'ilnd': 'Illinois Northern District Court',
  'ilcd': 'Illinois Central District Court',
  'ilsd': 'Illinois Southern District Court',
  'innd': 'Indiana Northern District Court',
  'insd': 'Indiana Southern District Court',
  'iand': 'Iowa Northern District Court',
  'iasd': 'Iowa Southern District Court',
  'ksd': 'Kansas District Court',
  'kyed': 'Kentucky Eastern District Court',
  'kywd': 'Kentucky Western District Court',
  'laed': 'Louisiana Eastern District Court',
  'lamd': 'Louisiana Middle District Court',
  'lawd': 'Louisiana Western District Court',
  'med': 'Maine District Court',
  'mdd': 'Maryland District Court',
  'mad': 'Massachusetts District Court',
  'mied': 'Michigan Eastern District Court',
  'miwd': 'Michigan Western District Court',
  'mnd': 'Minnesota District Court',
  'msnd': 'Mississippi Northern District Court',
  'mssd': 'Mississippi Southern District Court',
  'moed': 'Missouri Eastern District Court',
  'mowd': 'Missouri Western District Court',
  'mtd': 'Montana District Court',
  'ned': 'Nebraska District Court',
  'nvd': 'Nevada District Court',
  'nhd': 'New Hampshire District Court',
  'njd': 'New Jersey District Court',
  'nmd': 'New Mexico District Court',
  'nyed': 'New York Eastern District Court',
  'nysd': 'New York Southern District Court',
  'nynd': 'New York Northern District Court',
  'nywd': 'New York Western District Court',
  'nced': 'North Carolina Eastern District Court',
  'ncmd': 'North Carolina Middle District Court',
  'ncwd': 'North Carolina Western District Court',
  'ndd': 'North Dakota District Court',
  'nmid': 'Northern Mariana Islands District Court',
  'ohnd': 'Ohio Northern District Court',
  'ohsd': 'Ohio Southern District Court',
  'oked': 'Oklahoma Eastern District Court',
  'oknd': 'Oklahoma Northern District Court',
  'okwd': 'Oklahoma Western District Court',
  'ord': 'Oregon District Court',
  'paed': 'Pennsylvania Eastern District Court',
  'pamd': 'Pennsylvania Middle District Court',
  'pawd': 'Pennsylvania Western District Court',
  'prd': 'Puerto Rico District Court',
  'rid': 'Rhode Island District Court',
  'scd': 'South Carolina District Court',
  'sdd': 'South Dakota District Court',
  'tned': 'Tennessee Eastern District Court',
  'tnmd': 'Tennessee Middle District Court',
  'tnwd': 'Tennessee Western District Court',
  'txed': 'Texas Eastern District Court',
  'txnd': 'Texas Northern District Court',
  'txsd': 'Texas Southern District Court',
  'txwd': 'Texas Western District Court',
  'utd': 'Utah District Court',
  'vtd': 'Vermont District Court',
  'vid': 'Virgin Islands District Court',
  'vaed': 'Virginia Eastern District Court',
  'vawd': 'Virginia Western District Court',
  'waed': 'Washington Eastern District Court',
  'wawd': 'Washington Western District Court',
  'wvnd': 'West Virginia Northern District Court',
  'wvsd': 'West Virginia Southern District Court',
  'wied': 'Wisconsin Eastern District Court',
  'wiwd': 'Wisconsin Western District Court',
  'wyd': 'Wyoming District Court',
  
  // Bankruptcy Courts
  'alnb': 'Alabama Northern Bankruptcy Court',
  'alsb': 'Alabama Southern Bankruptcy Court',
  'akb': 'Alaska Bankruptcy Court',
  'azb': 'Arizona Bankruptcy Court',
  'areb': 'Arkansas Eastern Bankruptcy Court',
  'arwb': 'Arkansas Western Bankruptcy Court',
  'canb': 'California Northern Bankruptcy Court',
  'caeb': 'California Eastern Bankruptcy Court',
  'cacb': 'California Central Bankruptcy Court',
  'casb': 'California Southern Bankruptcy Court',
  'cob': 'Colorado Bankruptcy Court',
  'ctb': 'Connecticut Bankruptcy Court',
  'deb': 'Delaware Bankruptcy Court',
  'dcb': 'District of Columbia Bankruptcy Court',
  'flnb': 'Florida Northern Bankruptcy Court',
  'flmb': 'Florida Middle Bankruptcy Court',
  'flsb': 'Florida Southern Bankruptcy Court',
  'ganb': 'Georgia Northern Bankruptcy Court',
  'gamb': 'Georgia Middle Bankruptcy Court',
  'gasb': 'Georgia Southern Bankruptcy Court',
  'gub': 'Guam Bankruptcy Court',
  'hib': 'Hawaii Bankruptcy Court',
  'idb': 'Idaho Bankruptcy Court',
  'ilnb': 'Illinois Northern Bankruptcy Court',
  'ilcb': 'Illinois Central Bankruptcy Court',
  'ilsb': 'Illinois Southern Bankruptcy Court',
  'innb': 'Indiana Northern Bankruptcy Court',
  'insb': 'Indiana Southern Bankruptcy Court',
  'ianb': 'Iowa Northern Bankruptcy Court',
  'iasb': 'Iowa Southern Bankruptcy Court',
  'ksb': 'Kansas Bankruptcy Court',
  'kyeb': 'Kentucky Eastern Bankruptcy Court',
  'kywb': 'Kentucky Western Bankruptcy Court',
  'laeb': 'Louisiana Eastern Bankruptcy Court',
  'lamb': 'Louisiana Middle Bankruptcy Court',
  'lawb': 'Louisiana Western Bankruptcy Court',
  'meb': 'Maine Bankruptcy Court',
  'mdb': 'Maryland Bankruptcy Court',
  'mab': 'Massachusetts Bankruptcy Court',
  'mieb': 'Michigan Eastern Bankruptcy Court',
  'miwb': 'Michigan Western Bankruptcy Court',
  'mnb': 'Minnesota Bankruptcy Court',
  'msnb': 'Mississippi Northern Bankruptcy Court',
  'mssb': 'Mississippi Southern Bankruptcy Court',
  'moeb': 'Missouri Eastern Bankruptcy Court',
  'mowb': 'Missouri Western Bankruptcy Court',
  'mtb': 'Montana Bankruptcy Court',
  'neb': 'Nebraska Bankruptcy Court',
  'nvb': 'Nevada Bankruptcy Court',
  'nhb': 'New Hampshire Bankruptcy Court',
  'njb': 'New Jersey Bankruptcy Court',
  'nmb': 'New Mexico Bankruptcy Court',
  'nyeb': 'New York Eastern Bankruptcy Court',
  'nysb': 'New York Southern Bankruptcy Court',
  'nynb': 'New York Northern Bankruptcy Court',
  'nywb': 'New York Western Bankruptcy Court',
  'nceb': 'North Carolina Eastern Bankruptcy Court',
  'ncmb': 'North Carolina Middle Bankruptcy Court',
  'ncwb': 'North Carolina Western Bankruptcy Court',
  'ndb': 'North Dakota Bankruptcy Court',
  'nmib': 'Northern Mariana Islands Bankruptcy Court',
  'ohnb': 'Ohio Northern Bankruptcy Court',
  'ohsb': 'Ohio Southern Bankruptcy Court',
  'okeb': 'Oklahoma Eastern Bankruptcy Court',
  'oknb': 'Oklahoma Northern Bankruptcy Court',
  'okwb': 'Oklahoma Western Bankruptcy Court',
  'orb': 'Oregon Bankruptcy Court',
  'paeb': 'Pennsylvania Eastern Bankruptcy Court',
  'pamb': 'Pennsylvania Middle Bankruptcy Court',
  'pawb': 'Pennsylvania Western Bankruptcy Court',
  'prb': 'Puerto Rico Bankruptcy Court',
  'rib': 'Rhode Island Bankruptcy Court',
  'scb': 'South Carolina Bankruptcy Court',
  'sdb': 'South Dakota Bankruptcy Court',
  'tneb': 'Tennessee Eastern Bankruptcy Court',
  'tnmb': 'Tennessee Middle Bankruptcy Court',
  'tnwb': 'Tennessee Western Bankruptcy Court',
  'txeb': 'Texas Eastern Bankruptcy Court',
  'txnb': 'Texas Northern Bankruptcy Court',
  'txsb': 'Texas Southern Bankruptcy Court',
  'txwb': 'Texas Western Bankruptcy Court',
  'utb': 'Utah Bankruptcy Court',
  'vtb': 'Vermont Bankruptcy Court',
  'vib': 'Virgin Islands Bankruptcy Court',
  'vaeb': 'Virginia Eastern Bankruptcy Court',
  'vawb': 'Virginia Western Bankruptcy Court',
  'waeb': 'Washington Eastern Bankruptcy Court',
  'wawb': 'Washington Western Bankruptcy Court',
  'wvnb': 'West Virginia Northern Bankruptcy Court',
  'wvsb': 'West Virginia Southern Bankruptcy Court',
  'wieb': 'Wisconsin Eastern Bankruptcy Court',
  'wiwb': 'Wisconsin Western Bankruptcy Court',
  'wyb': 'Wyoming Bankruptcy Court',
  
  // Specialized Courts
  'cit': 'Court of International Trade',
  'uscfc': 'United States Court of Federal Claims',
  'uscfc': 'Court of Federal Claims',
  'uscfc': 'Federal Claims Court'
};

// State Supreme Courts
const STATE_SUPREME_COURTS = {
  'al': 'Alabama Supreme Court',
  'ak': 'Alaska Supreme Court',
  'az': 'Arizona Supreme Court',
  'ar': 'Arkansas Supreme Court',
  'ca': 'California Supreme Court',
  'co': 'Colorado Supreme Court',
  'ct': 'Connecticut Supreme Court',
  'de': 'Delaware Supreme Court',
  'fl': 'Florida Supreme Court',
  'ga': 'Georgia Supreme Court',
  'hi': 'Hawaii Supreme Court',
  'id': 'Idaho Supreme Court',
  'il': 'Illinois Supreme Court',
  'in': 'Indiana Supreme Court',
  'ia': 'Iowa Supreme Court',
  'ks': 'Kansas Supreme Court',
  'ky': 'Kentucky Supreme Court',
  'la': 'Louisiana Supreme Court',
  'me': 'Maine Supreme Judicial Court',
  'md': 'Maryland Court of Appeals',
  'ma': 'Massachusetts Supreme Judicial Court',
  'mi': 'Michigan Supreme Court',
  'mn': 'Minnesota Supreme Court',
  'ms': 'Mississippi Supreme Court',
  'mo': 'Missouri Supreme Court',
  'mt': 'Montana Supreme Court',
  'ne': 'Nebraska Supreme Court',
  'nv': 'Nevada Supreme Court',
  'nh': 'New Hampshire Supreme Court',
  'nj': 'New Jersey Supreme Court',
  'nm': 'New Mexico Supreme Court',
  'ny': 'New York Court of Appeals',
  'nc': 'North Carolina Supreme Court',
  'nd': 'North Dakota Supreme Court',
  'oh': 'Ohio Supreme Court',
  'ok': 'Oklahoma Supreme Court',
  'or': 'Oregon Supreme Court',
  'pa': 'Pennsylvania Supreme Court',
  'ri': 'Rhode Island Supreme Court',
  'sc': 'South Carolina Supreme Court',
  'sd': 'South Dakota Supreme Court',
  'tn': 'Tennessee Supreme Court',
  'tx': 'Texas Supreme Court',
  'ut': 'Utah Supreme Court',
  'vt': 'Vermont Supreme Court',
  'va': 'Virginia Supreme Court',
  'wa': 'Washington Supreme Court',
  'wv': 'West Virginia Supreme Court',
  'wi': 'Wisconsin Supreme Court',
  'wy': 'Wyoming Supreme Court'
};

// Comprehensive jurisdiction to court codes mapping
const COURT_MAP = {
  // Federal jurisdictions
  'federal': 'ca1,ca2,ca3,ca4,ca5,ca6,ca7,ca8,ca9,ca10,ca11,cadc,cafc,cavet',
  'us': 'ca1,ca2,ca3,ca4,ca5,ca6,ca7,ca8,ca9,ca10,ca11,cadc,cafc,cavet',
  'united states': 'ca1,ca2,ca3,ca4,ca5,ca6,ca7,ca8,ca9,ca10,ca11,cadc,cafc,cavet',
  
  // State jurisdictions with comprehensive court coverage
  'alabama': 'alnd,alsd,alnb,alsb',
  'al': 'alnd,alsd,alnb,alsb',
  
  'alaska': 'akd,akb',
  'ak': 'akd,akb',
  
  'arizona': 'azd,azb',
  'az': 'azd,azb',
  
  'arkansas': 'ared,arwd,areb,arwb',
  'ar': 'ared,arwd,areb,arwb',
  
  'california': 'cand,caed,cacd,casd,canb,caeb,cacb,casb,ca9',
  'ca': 'cand,caed,cacd,casd,canb,caeb,cacb,casb,ca9',
  
  'colorado': 'cod,cob',
  'co': 'cod,cob',
  
  'connecticut': 'ctd,ctb',
  'ct': 'ctd,ctb',
  
  'delaware': 'ded,deb',
  'de': 'ded,deb',
  
  'district of columbia': 'dcd,dcb,cadc',
  'dc': 'dcd,dcb,cadc',
  'washington dc': 'dcd,dcb,cadc',
  
  'florida': 'flnd,flmd,flsd,flnb,flmb,flsb',
  'fl': 'flnd,flmd,flsd,flnb,flmb,flsb',
  
  'georgia': 'gand,gamd,gasd,ganb,gamb,gasb',
  'ga': 'gand,gamd,gasd,ganb,gamb,gasb',
  
  'hawaii': 'hid,hib',
  'hi': 'hid,hib',
  
  'idaho': 'idd,idb',
  'id': 'idd,idb',
  
  'illinois': 'ilnd,ilcd,ilsd,ilnb,ilcb,ilsb',
  'il': 'ilnd,ilcd,ilsd,ilnb,ilcb,ilsb',
  
  'indiana': 'innd,insd,innb,insb',
  'in': 'innd,insd,innb,insb',
  
  'iowa': 'iand,iasd,ianb,iasb',
  'ia': 'iand,iasd,ianb,iasb',
  
  'kansas': 'ksd,ksb',
  'ks': 'ksd,ksb',
  
  'kentucky': 'kyed,kywd,kyeb,kywb',
  'ky': 'kyed,kywd,kyeb,kywb',
  
  'louisiana': 'laed,lamd,lawd,laeb,lamb,lawb',
  'la': 'laed,lamd,lawd,laeb,lamb,lawb',
  
  'maine': 'med,meb',
  'me': 'med,meb',
  
  'maryland': 'mdd,mdb',
  'md': 'mdd,mdb',
  
  'massachusetts': 'mad,mab',
  'ma': 'mad,mab',
  
  'michigan': 'mied,miwd,mieb,miwb',
  'mi': 'mied,miwd,mieb,miwb',
  
  'minnesota': 'mnd,mnb',
  'mn': 'mnd,mnb',
  
  'mississippi': 'msnd,mssd,msnb,mssb',
  'ms': 'msnd,mssd,msnb,mssb',
  
  'missouri': 'moed,mowd,moeb,mowb',
  'mo': 'moed,mowd,moeb,mowb',
  
  'montana': 'mtd,mtb',
  'mt': 'mtd,mtb',
  
  'nebraska': 'ned,neb',
  'ne': 'ned,neb',
  
  'nevada': 'nvd,nvb',
  'nv': 'nvd,nvb',
  
  'new hampshire': 'nhd,nhb',
  'nh': 'nhd,nhb',
  
  'new jersey': 'njd,njb',
  'nj': 'njd,njb',
  
  'new mexico': 'nmd,nmb',
  'nm': 'nmd,nmb',
  
  'new york': 'nyed,nysd,nynd,nywd,nyeb,nysb,nynb,nywb,ca2',
  'ny': 'nyed,nysd,nynd,nywd,nyeb,nysb,nynb,nywb,ca2',
  
  'north carolina': 'nced,ncmd,ncwd,nceb,ncmb,ncwb',
  'nc': 'nced,ncmd,ncwd,nceb,ncmb,ncwb',
  
  'north dakota': 'ndd,ndb',
  'nd': 'ndd,ndb',
  
  'ohio': 'ohnd,ohsd,ohnb,ohsb',
  'oh': 'ohnd,ohsd,ohnb,ohsb',
  
  'oklahoma': 'oked,oknd,okwd,okeb,oknb,okwb',
  'ok': 'oked,oknd,okwd,okeb,oknb,okwb',
  
  'oregon': 'ord,orb',
  'or': 'ord,orb',
  
  'pennsylvania': 'paed,pamd,pawd,paeb,pamb,pawb',
  'pa': 'paed,pamd,pawd,paeb,pamb,pawb',
  
  'rhode island': 'rid,rib',
  'ri': 'rid,rib',
  
  'south carolina': 'scd,scb',
  'sc': 'scd,scb',
  
  'south dakota': 'sdd,sdb',
  'sd': 'sdd,sdb',
  
  'tennessee': 'tned,tnmd,tnwd,tneb,tnmb,tnwb',
  'tn': 'tned,tnmd,tnwd,tneb,tnmb,tnwb',
  
  'texas': 'txed,txnd,txsd,txwd,txeb,txnb,txsb,txwb,ca5',
  'tx': 'txed,txnd,txsd,txwd,txeb,txnb,txsb,txwb,ca5',
  
  'utah': 'utd,utb',
  'ut': 'utd,utb',
  
  'vermont': 'vtd,vtb',
  'vt': 'vtd,vtb',
  
  'virginia': 'vaed,vawd,vaeb,vawb',
  'va': 'vaed,vawd,vaeb,vawb',
  
  'washington': 'waed,wawd,waeb,wawb',
  'wa': 'waed,wawd,waeb,wawb',
  
  'west virginia': 'wvnd,wvsd,wvnb,wvsb',
  'wv': 'wvnd,wvsd,wvnb,wvsb',
  
  'wisconsin': 'wied,wiwd,wieb,wiwb',
  'wi': 'wied,wiwd,wieb,wiwb',
  
  'wyoming': 'wyd,wyb',
  'wy': 'wyd,wyb',
  
  // Territories
  'guam': 'gud,gub',
  'puerto rico': 'prd,prb',
  'virgin islands': 'vid,vib',
  'northern mariana islands': 'nmid,nmib',
  
  // Specialized federal courts
  'international trade': 'cit',
  'federal claims': 'uscfc',
  'veterans claims': 'cavet',
  'federal circuit': 'cafc'
};

/**
 * Maps a jurisdiction to CourtListener court codes
 * @param {string} jurisdiction - The jurisdiction (state, federal, etc.)
 * @param {string} courtType - Optional court type filter ('district', 'bankruptcy', 'supreme', 'circuit')
 * @returns {string} Comma-separated list of court codes
 */
function mapToCourtListenerCourt(jurisdiction, courtType = null) {
  if (!jurisdiction) return '';
  
  const normalizedJurisdiction = jurisdiction.toLowerCase().trim();
  const courtCodes = COURT_MAP[normalizedJurisdiction];
  
  if (!courtCodes) return '';
  
  // If no specific court type requested, return all codes
  if (!courtType) return courtCodes;
  
  // Filter by court type if specified
  const codes = courtCodes.split(',');
  const filteredCodes = codes.filter(code => {
    switch (courtType.toLowerCase()) {
      case 'district':
        return code.includes('d') && !code.includes('b');
      case 'bankruptcy':
        return code.includes('b');
      case 'supreme':
        return code.length === 2 && !code.includes('d') && !code.includes('b');
      case 'circuit':
        return code.startsWith('ca');
      default:
        return true;
    }
  });
  
  return filteredCodes.join(',');
}

/**
 * Gets all available court codes for a jurisdiction
 * @param {string} jurisdiction - The jurisdiction
 * @returns {Array} Array of court codes
 */
function getCourtCodes(jurisdiction) {
  const codes = mapToCourtListenerCourt(jurisdiction);
  return codes ? codes.split(',') : [];
}

/**
 * Gets court information by court code
 * @param {string} courtCode - The court code
 * @returns {string} Court name or null if not found
 */
function getCourtName(courtCode) {
  return FEDERAL_COURTS[courtCode] || STATE_SUPREME_COURTS[courtCode] || null;
}

/**
 * Gets all available jurisdictions
 * @returns {Array} Array of jurisdiction names
 */
function getAvailableJurisdictions() {
  return Object.keys(COURT_MAP);
}

/**
 * Validates if a court code is valid
 * @param {string} courtCode - The court code to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidCourtCode(courtCode) {
  return !!(FEDERAL_COURTS[courtCode] || STATE_SUPREME_COURTS[courtCode]);
}

module.exports = {
  COURT_MAP,
  FEDERAL_COURTS,
  STATE_SUPREME_COURTS,
  mapToCourtListenerCourt,
  getCourtCodes,
  getCourtName,
  getAvailableJurisdictions,
  isValidCourtCode
}; 