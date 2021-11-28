import Loader from "./loader";
const cardano = async () => {
  await Loader.load();
  return Loader.Cardano;
};
export default cardano;