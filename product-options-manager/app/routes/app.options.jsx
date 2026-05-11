import {
  Page,
  Card,
  Button,
  IndexTable,
  Text,
  Badge,
  InlineStack,
} from "@shopify/polaris";

export default function ProductOptionsPage() {
  const groups = [
    {
      id: "1",
      name: "Black Cotton canvas Zipper Box Kit",
      status: "Active",
      options: 6,
    },
    {
      id: "2",
      name: "Green Canvas Zipper Box Kit",
      status: "Active",
      options: 6,
    },
  ];

  return (
    <Page
      title="Product Options"
      primaryAction={{
        content: "Add group",
        url: "/app/options/new",
      }}
    >
      <Card>
        <IndexTable
          resourceName={{ singular: "group", plural: "groups" }}
          itemCount={groups.length}
          headings={[
            { title: "Group name" },
            { title: "Options" },
            { title: "Status" },
            { title: "Actions" },
          ]}
          selectable={false}
        >
          {groups.map((group, index) => (
            <IndexTable.Row id={group.id} key={group.id} position={index}>
              <IndexTable.Cell>
                <Text as="span" fontWeight="semibold">
                  {group.name}
                </Text>
              </IndexTable.Cell>

              <IndexTable.Cell>{group.options}</IndexTable.Cell>

              <IndexTable.Cell>
                <Badge tone="success">{group.status}</Badge>
              </IndexTable.Cell>

              <IndexTable.Cell>
                <InlineStack gap="200">
                  <Button url={`/app/options/${group.id}`}>Edit</Button>
                  <Button>Duplicate</Button>
                  <Button tone="critical">Delete</Button>
                </InlineStack>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
