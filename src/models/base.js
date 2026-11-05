import mongoose from 'mongoose';

export const { Schema, model } = mongoose;
export const Mixed = mongoose.Schema.Types.Mixed;

export const define = (name, fields, options = {}, indexes = []) => {
  const schema = new Schema({ _id: { type: String, required: true }, ...fields }, { versionKey: false, minimize: false, ...options });
  for (const index of indexes) schema.index(...[].concat(index));
  return model(name, schema);
};

export const account = {
  passwordHash: { type: String, default: '' },
  tokenVersion: { type: Number, default: 0 },
  deletedAt: { type: Date, default: null },
  // Bumped inside a transaction so two money or stock changes for one record can't overlap.
  rev: { type: Number, default: 0 },
};

export const latLng = { lat: Number, lng: Number };

export const addressFields = {
  id: String,
  label: String,
  contactName: { type: String, default: '' },
  phone: { type: String, default: '' },
  line: String,
  landmark: { type: String, default: '' },
  city: String,
  pincode: String,
  instructions: { type: String, default: '' },
  isDefault: { type: Boolean, default: false },
  lat: Number,
  lng: Number,
};
export const addressSchema = new Schema(addressFields, { _id: false });

export const photoSchema = new Schema({ url: String, takenAt: Date, serverAt: Date }, { _id: false });
