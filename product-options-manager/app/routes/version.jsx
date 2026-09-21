export const loader = () => {
  return Response.json(
    {
      version: "moonflower-native-pricing-v2",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
