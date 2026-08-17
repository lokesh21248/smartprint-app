export interface LocationData {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeName?: string;
  houseDetails?: string;
  receiverName?: string;
  receiverMobile?: string;
  addressLabel?: "home" | "shop" | "other" | null;
}

export interface DeliveryLocation {
  type: "pickup" | "drop";
  latitude: number;
  longitude: number;
  address: string;
  placeName?: string;
  houseDetails?: string;
  receiverName?: string;
  receiverMobile?: string;
  addressLabel?: "home" | "shop" | "other" | null;
}
