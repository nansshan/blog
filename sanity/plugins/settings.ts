import { type ComponentType } from 'react'
import { definePlugin, type DocumentDefinition } from 'sanity'
import { type StructureResolver } from 'sanity/desk'

import { TagIcon } from '~/assets'

export const settingsPlugin = definePlugin<{ type: string }>(({ type }) => {
  return {
    name: 'settings',
    document: {
      // Hide 'Settings' from new document options
      newDocumentOptions: (prev, { creationContext }) => {
        if (creationContext.type === 'global') {
          return prev.filter((templateItem) => templateItem.templateId !== type)
        }

        return prev
      },
      // Removes the "duplicate" action on the "settings" singleton
      actions: (prev, { schemaType }) => {
        if (schemaType === type) {
          return prev.filter(({ action }) => action !== 'duplicate')
        }

        return prev
      },
    },
  }
})

// The StructureResolver is how we're changing the DeskTool
// structure to linking to a single "Settings" document
export const settingsStructure = (
  typeDef: DocumentDefinition
): StructureResolver => {
  return (S) => {
    // The `Settings` root list item
    const settingsListItem = // A singleton not using `documentListItem`, eg no built-in preview
      S.listItem()
        .id(typeDef.name)
        .title(typeDef.title ?? 'Settings')
        .icon(typeDef.icon)
        .child(
          S.editor()
            .id(typeDef.name)
            .schemaType(typeDef.name)
            .documentId(typeDef.name)
        )

    // The default root list items (except custom ones)
    const defaultListItems = S.documentTypeListItems()
      .filter((listItem) => listItem.getId() !== typeDef.name)
      .map((listItem) => {
        // Fix media.tag icon size (plugin uses viewBox 512x512, should be 24x24)
        if (listItem.getId() === 'media.tag') {
          return listItem.icon(TagIcon as ComponentType)
        }
        return listItem
      })

    return S.list()
      .id('root')
      .title('内容管理')
      .items([settingsListItem, S.divider(), ...defaultListItems])
  }
}
