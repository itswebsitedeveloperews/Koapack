import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  BlockStack,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { useState } from "react";

export default function NewOptionGroupPage() {
  const [groupName, setGroupName] = useState("");
  const [targetType, setTargetType] = useState("single");

  return (
    <Page
      title="Add option group"
      backAction={{ content: "Product Options", url: "/app/options" }}
    >
      <BlockStack gap="400">
        <Card>
          <FormLayout>
            <TextField
              label="Group name"
              value={groupName}
              onChange={setGroupName}
              placeholder="Black Cotton canvas Zipper Box Kit"
              autoComplete="off"
            />

            <Select
              label="Status"
              options={[
                { label: "Active", value: "active" },
                { label: "Draft", value: "draft" },
              ]}
              value="active"
            />
          </FormLayout>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Options
            </Text>

            <InlineStack gap="200">
              <Button>+ Quantity</Button>
              <Button>+ Size</Button>
              <Button>+ Printing</Button>
              <Button>+ Logo upload</Button>
              <Button>+ Pincode</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Product targeting
            </Text>

            <Select
              label="Show on"
              options={[
                { label: "Single product", value: "single" },
                { label: "Multiple products", value: "multiple" },
              ]}
              value={targetType}
              onChange={setTargetType}
            />

            <Button>Select product</Button>
          </BlockStack>
        </Card>

        <InlineStack align="end">
          <Button variant="primary">Save group</Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}
