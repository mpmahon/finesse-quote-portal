/**
 * Static, PUBLIC landing-page catalogue teaser data — generated from the
 * 2026-07-16 supplier catalogue mapping (see resources/supplier-scrapes/).
 * Deliberately static: the landing page is unauthenticated and the blind
 * hierarchy tables are RLS'd to authenticated users, so the teaser ships
 * at build time. De-branded: no supplier names, codes or hotlinks. No
 * pricing (indicative pricing requires the authed gallery).
 *
 * Regenerate: outputs/ scripts from the 2026-07-16 catalogue batch, or
 * edit by hand — this is display copy, not a source of truth.
 */

export interface LandingBanner { image: string; title: string; line: string }
export interface LandingTypeTeaser { name: string; image: string | null; description: string }
export interface LandingStyleTeaser {
  type: string; opacity: string; name: string; image: string
  description: string; colours: string[]
}

export const LANDING_BANNERS: LandingBanner[] = [
  {
    "image": "/images/catalog/banners/roller.jpg",
    "title": "Roller Shades",
    "line": "Clean lines, total light control \u2014 from airy screens to full blackout."
  },
  {
    "image": "/images/catalog/banners/neolux.jpg",
    "title": "Neolux Dual Shades",
    "line": "Privacy at a turn \u2014 banded shades that shift from view to seclusion."
  },
  {
    "image": "/images/catalog/banners/dunes.jpg",
    "title": "Dune Shades",
    "line": "The evolution of drapery \u2014 soft, fluid, precise."
  },
  {
    "image": "/images/catalog/banners/sliding.jpg",
    "title": "Sliding Panels",
    "line": "Big glass, covered \u2014 panels that glide across walls of light."
  },
  {
    "image": "/images/catalog/banners/exterior.jpg",
    "title": "Exterior Awnings",
    "line": "Outdoor living, covered \u2014 cassette awnings and screens built for the sun."
  }
]

export const LANDING_TYPES: LandingTypeTeaser[] = [
  {
    "name": "Roller Shade",
    "image": "/images/catalog/types/roller-shade.jpg",
    "description": "Roller shades give living spaces adaptable comfort \u2014 large windows, small openings, multi-functional rooms \u2014 with a clean, cutting-edge look. Our fabric programme spans decorative plains, sheers, technical solar screens and total blackouts, in practical widths that avoid joins and seams."
  },
  {
    "name": "Neolux Shade",
    "image": "/images/catalog/types/neolux-shade.jpg",
    "description": "A contemporary dual-banded shade: alternating sheer and solid bands glide past each other so you decide exactly how much light and privacy you want, from open view to dim-out."
  },
  {
    "name": "Sliding Panel",
    "image": "/images/catalog/types/sliding-panel.jpg",
    "description": "Designed to cover large glass surfaces and to separate areas in multipurpose spaces. The panel system works with 2 to 5 channels and cord, wand or motor operation, hiding the mechanism for a uniform look with almost no light gap."
  },
  {
    "name": "Cellular",
    "image": "/images/catalog/types/cellular.jpg",
    "description": "Honeycomb cells trap air for the best insulation of any shade \u2014 and stack to almost nothing when raised. From airy sheers to full blackout."
  },
  {
    "name": "Dune",
    "image": "/images/catalog/types/dune.jpg",
    "description": "The evolution of traditional draperies: soft, lightweight two-layer fabric with the fluid look of a curtain and the precise control of a blind. Cord, wand or motorised operation."
  },
  {
    "name": "Horizontal",
    "image": "/images/catalog/types/horizontal.jpg",
    "description": "2-inch wood and wood-effect slats bring distinguished character to any space, with light control by tilt and finishes that pair with any furnishing."
  },
  {
    "name": "Exterior Awnings",
    "image": "/images/catalog/awnings/cassette-awnings.jpg",
    "description": "Cassette and traditional awnings, window awnings and wind-stable zip screens \u2014 outdoor living, covered."
  }
]

export const LANDING_STYLES: LandingStyleTeaser[] = [
  {
    "type": "Roller Shade",
    "opacity": "Blackout",
    "name": "Rome",
    "image": "/images/catalog/styles/roller-shade-blackout-rome.jpg",
    "description": "A luxuriously thick blackout with a soft fabric face \u2014 deep light block with an upholstered look.",
    "colours": [
      "#EFEEF0",
      "#F0ECE3",
      "#C9C1BC",
      "#B1AFB2",
      "#B1AFB2",
      "#5D4E4D"
    ]
  },
  {
    "type": "Roller Shade",
    "opacity": "Full Privacy",
    "name": "Natural View",
    "image": "/images/catalog/styles/roller-shade-full-privacy-natural-view.jpg",
    "description": "A softly textured light-filtering weave that glows with natural daylight while fully screening the room from view.",
    "colours": [
      "#DDD2C8",
      "#E7E3E3",
      "#E0D8CD",
      "#B39F8E",
      "#645A59",
      "#585758"
    ]
  },
  {
    "type": "Roller Shade",
    "opacity": "Sheer",
    "name": "Screen 5%",
    "image": "/images/catalog/styles/roller-shade-sheer-screen-5.jpg",
    "description": "An airy solar screen with 5% openness \u2014 keeps your view and daylight while cutting glare and UV. A favourite for living areas and offices.",
    "colours": [
      "#EFEDEB",
      "#D8CEBE",
      "#C4C3C0",
      "#D8CEBE",
      "#B8B4AC",
      "#403C39",
      "#616061",
      "#616061"
    ]
  },
  {
    "type": "Roller Shade",
    "opacity": "Full Privacy",
    "name": "Wood Look",
    "image": "/images/catalog/styles/roller-shade-full-privacy-wood-look.jpg",
    "description": "Wood-grain texture in a rolling shade \u2014 the warmth of timber with the practicality of fabric.",
    "colours": [
      "#E8E6EC",
      "#E8E6EC",
      "#CEB899",
      "#8A755A",
      "#8C6650",
      "#6F513F",
      "#493C36",
      "#99989B"
    ]
  },
  {
    "type": "Roller Shade",
    "opacity": "Blackout",
    "name": "Luxury",
    "image": "/images/catalog/styles/roller-shade-blackout-luxury.jpg",
    "description": "A twill-woven blackout with a designer palette from Pure White to Marine, finished with an acrylic light-block coating.",
    "colours": [
      "#ECEBEB",
      "#E4E1D8",
      "#807875",
      "#787873",
      "#513E40",
      "#464347"
    ]
  },
  {
    "type": "Roller Shade",
    "opacity": "Full Privacy",
    "name": "Stucco",
    "image": "/images/catalog/styles/roller-shade-full-privacy-stucco.jpg",
    "description": "A finely textured decorative plain with an acrylic-coated finish. Certified low-emission and flame retardant, with a five-year warranty.",
    "colours": [
      "#FAF7EE",
      "#FAF7E5",
      "#F5EED9",
      "#E9DDC1",
      "#D1C5B5",
      "#808780"
    ]
  },
  {
    "type": "Neolux Shade",
    "opacity": "Non Dim out",
    "name": "Premium",
    "image": "/images/catalog/styles/neolux-shade-non-dim-out-premium.jpg",
    "description": "Alternating sheer and solid bands in thirteen colours \u2014 glide between open view and soft privacy with a turn of the bands.",
    "colours": [
      "#F2F0F1",
      "#F2F0F1",
      "#E9E5D5",
      "#E8DFCF",
      "#ECE9E8",
      "#746559",
      "#D69C5D",
      "#B6B0AF"
    ]
  },
  {
    "type": "Neolux Shade",
    "opacity": "Dim out",
    "name": "Milano",
    "image": "/images/catalog/styles/neolux-shade-dim-out-milano.jpg",
    "description": "Block-out bands for the deepest light control in the banded family.",
    "colours": [
      "#CECCD2",
      "#C8C5C5",
      "#989497",
      "#BBB3A9",
      "#544946"
    ]
  },
  {
    "type": "Neolux Shade",
    "opacity": "Non Dim out",
    "name": "Marbella",
    "image": "/images/catalog/styles/neolux-shade-non-dim-out-marbella.jpg",
    "description": "A substantial banded weave including silver and wood-tone finishes.",
    "colours": [
      "#EDEBEC",
      "#E2DDC5",
      "#848386",
      "#7A634F"
    ]
  },
  {
    "type": "Sliding Panel",
    "opacity": "Full Privacy",
    "name": "Madrid",
    "image": "/images/catalog/styles/sliding-panel-full-privacy-madrid.jpg",
    "description": "Wide-width translucent panels for seamless large-format coverage.",
    "colours": [
      "#F1F0EF",
      "#F1EBD1",
      "#525152",
      "#453B38"
    ]
  },
  {
    "type": "Sliding Panel",
    "opacity": "Blackout",
    "name": "Advantage",
    "image": "/images/catalog/styles/sliding-panel-blackout-advantage.jpg",
    "description": "Heavyweight blackout panels for media walls and bedrooms with sliding doors.",
    "colours": [
      "#EDEFF0",
      "#E5E4DC",
      "#C0B5A7",
      "#999084",
      "#5F5352",
      "#BFC0C2",
      "#7E828B",
      "#403F43"
    ]
  },
  {
    "type": "Dune",
    "opacity": "Full Privacy",
    "name": "Aurora",
    "image": "/images/catalog/styles/dune-full-privacy-aurora.jpg",
    "description": "A soft two-layer drapery shade: solid vanes faced with sheer \u2014 fluid like a curtain, precise like a blind.",
    "colours": [
      "#F6F6F6",
      "#F8F9F4",
      "#E8E4DB",
      "#DFD6C9",
      "#B6BABE"
    ]
  },
  {
    "type": "Dune",
    "opacity": "Full Privacy",
    "name": "Luna",
    "image": "/images/catalog/styles/dune-full-privacy-luna.jpg",
    "description": "The deepest member of the Dune family \u2014 fuller vanes for richer privacy and light control.",
    "colours": [
      "#FEFEFE",
      "#FDFDFD",
      "#EFEEE6",
      "#B2B2B6",
      "#A4A4A4"
    ]
  },
  {
    "type": "Cellular",
    "opacity": "Full Privacy",
    "name": "Bolero",
    "image": "/images/catalog/styles/cellular-full-privacy-bolero.jpg",
    "description": "A translucent honeycomb in seven tones \u2014 daylight through, view blocked, heat kept out.",
    "colours": [
      "#F4F3F0",
      "#E4E1CC",
      "#D0C7AA",
      "#B3AA97",
      "#978D80",
      "#717576",
      "#929590"
    ]
  },
  {
    "type": "Cellular",
    "opacity": "Blackout",
    "name": "Noite",
    "image": "/images/catalog/styles/cellular-blackout-noite.jpg",
    "description": "A blackout honeycomb: total darkness plus the best insulation of any shade type.",
    "colours": [
      "#93999F",
      "#908B70",
      "#90835E",
      "#70674D",
      "#595A51"
    ]
  },
  {
    "type": "Horizontal",
    "opacity": "Full Privacy",
    "name": "Real wood",
    "image": "/images/catalog/styles/horizontal-full-privacy-real-wood.jpg",
    "description": "2-inch basswood slats in natural and stained finishes \u2014 durable, dimensionally stable and naturally warm.",
    "colours": [
      "#6B2E20",
      "#B68955",
      "#C9A66B"
    ]
  }
]
