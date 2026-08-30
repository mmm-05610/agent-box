export const route = () => location.hash.slice(1) || "/works";
export const navigate = (path: string) => {
  location.hash = path;
};
