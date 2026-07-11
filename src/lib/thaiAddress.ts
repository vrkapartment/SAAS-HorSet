// แยก/รวมที่อยู่ไทยเป็นช่องย่อย (เลขที่, ถนน, ตำบล/แขวง, อำเภอ/เขต, จังหวัด, รหัสไปรษณีย์)
// ใช้ร่วมกันระหว่างหน้าตั้งค่าการเงิน (เก็บที่อยู่รวมเป็นข้อความเดียวในคอลัมน์ tax_address)
// กับตอนสร้าง PDF แบบฟอร์มภาษีที่ต้องการช่องที่อยู่แยกตามแบบฟอร์มจริง

export interface ParsedAddress {
  no: string
  road: string
  subdistrict: string
  district: string
  province: string
  zipcode: string
}

export function parseAddress(fullAddress: string): ParsedAddress {
  const result: ParsedAddress = {
    no: "",
    road: "",
    subdistrict: "",
    district: "",
    province: "",
    zipcode: ""
  }

  if (!fullAddress) return result

  // Extract postal code (5 digits at the end)
  const zipMatch = fullAddress.match(/\b\d{5}\b/)
  if (zipMatch) {
    result.zipcode = zipMatch[0]
    fullAddress = fullAddress.replace(zipMatch[0], "").trim()
  }

  // Extract province: look for จังหวัด... or จ.... or กรุงเทพ...
  const provinceKeywords = ["จังหวัด", "จ.", "กรุงเทพมหานคร", "กรุงเทพฯ", "กรุงเทพ"]
  let foundProvince = ""
  for (const kw of provinceKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundProvince = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundProvince) {
    result.province = foundProvince.replace(/^(จังหวัด|จ\.)\s*/, "").trim()
  }

  // Extract district: look for อำเภอ... or อ.... or เขต...
  const districtKeywords = ["อำเภอ", "เขต", "อ."]
  let foundDistrict = ""
  for (const kw of districtKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundDistrict = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundDistrict) {
    result.district = foundDistrict.replace(/^(อำเภอ|เขต|อ\.)\s*/, "").trim()
  }

  // Extract subdistrict: look for ตำบล... or ต.... or แขวง...
  const subdistrictKeywords = ["ตำบล", "แขวง", "ต."]
  let foundSubdistrict = ""
  for (const kw of subdistrictKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundSubdistrict = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundSubdistrict) {
    result.subdistrict = foundSubdistrict.replace(/^(ตำบล|แขวง|ต\.)\s*/, "").trim()
  }

  // Extract road: look for ถนน... or ถ....
  const roadKeywords = ["ถนน", "ถ."]
  let foundRoad = ""
  for (const kw of roadKeywords) {
    if (fullAddress.includes(kw)) {
      const idx = fullAddress.indexOf(kw)
      const after = fullAddress.substring(idx).trim()
      foundRoad = after
      fullAddress = fullAddress.substring(0, idx).trim()
      break
    }
  }
  if (foundRoad) {
    result.road = foundRoad.replace(/^(ถนน|ถ\.)\s*/, "").trim()
  }

  // The rest is address No
  result.no = fullAddress.replace(/,$/, "").trim()

  return result
}

export function formatAddress(no: string, road: string, subdistrict: string, district: string, province: string, zipcode: string): string {
  const parts: string[] = []
  if (no) parts.push(no)

  if (road && road !== "-") {
    if (road.startsWith("ถนน") || road.startsWith("ถ.")) {
      parts.push(road)
    } else {
      parts.push(`ถนน${road}`)
    }
  }

  if (subdistrict) {
    const isBkk = province.includes("กรุงเทพ") || province.includes("BKK") || province.includes("Bangkok")
    const prefix = isBkk ? "แขวง" : "ตำบล"
    if (subdistrict.startsWith(prefix) || subdistrict.startsWith("ต.") || subdistrict.startsWith("ต ")) {
      parts.push(subdistrict)
    } else {
      parts.push(`${prefix}${subdistrict}`)
    }
  }

  if (district) {
    const isBkk = province.includes("กรุงเทพ") || province.includes("BKK") || province.includes("Bangkok")
    const prefix = isBkk ? "เขต" : "อำเภอ"
    if (district.startsWith(prefix) || district.startsWith("อ.") || district.startsWith("อ ")) {
      parts.push(district)
    } else {
      parts.push(`${prefix}${district}`)
    }
  }

  if (province) {
    const isBkk = province.includes("กรุงเทพ") || province.includes("BKK") || province.includes("Bangkok")
    if (isBkk) {
      parts.push(province)
    } else {
      if (province.startsWith("จังหวัด") || province.startsWith("จ.")) {
        parts.push(province)
      } else {
        parts.push(`จังหวัด${province}`)
      }
    }
  }

  if (zipcode) parts.push(zipcode)

  return parts.join(" ")
}